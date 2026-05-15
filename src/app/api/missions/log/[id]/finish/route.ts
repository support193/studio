// Finalise a mission_attempt_logs row.
//
// The client posts the recorded trajectory; the server is the source of
// truth for the quality score.  We run replayEpisode() over the frames to
// recompute everything (six sub-metrics, eight flags, stars, status), then
// — if the canonical quality_score clears xp_settings.trajectory_min_score
// — gzip-upload the trajectory to the `mission-trajectories` bucket and
// stash the reference path on the log row.
//
// XP is still distributed weekly; this endpoint never fills xp_awarded.

import { NextRequest, NextResponse } from 'next/server';
import { gzipSync } from 'node:zlib';
import { createAdminClient } from '@/lib/supabase/admin';
import { getServerUser } from '@/lib/auth/server-user';
import { replayEpisode } from '@/lib/missions/metrics';
import type { TrajectoryEnvelope, TrajectoryFrame } from '@/lib/missions/metrics';
import type { Condition, MissionObject } from '@/lib/missions/types';

const MAX_FRAMES = 10_000;     // ~1000 s at 10 Hz; ~5 MB raw JSON worst case
const MAX_BODY_BYTES = 8_000_000;

interface FinishBody {
  elapsedS: number;
  frames: TrajectoryFrame[];
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: logId } = await params;
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const supabase = createAdminClient();

  // Size guard before parsing JSON.
  const contentLength = parseInt(req.headers.get('content-length') ?? '0', 10);
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'payload_too_large' }, { status: 413 });
  }

  let body: FinishBody;
  try {
    body = (await req.json()) as FinishBody;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  // ── input validation ─────────────────────────────────────────────────
  if (!body || typeof body.elapsedS !== 'number' || !Array.isArray(body.frames)) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  if (body.frames.length > MAX_FRAMES) {
    return NextResponse.json({ error: 'too_many_frames' }, { status: 413 });
  }
  for (let i = 0; i < body.frames.length; i++) {
    if (!isValidFrame(body.frames[i])) {
      return NextResponse.json({ error: `invalid_frame_${i}` }, { status: 400 });
    }
  }

  // ── log row + ownership check ────────────────────────────────────────
  const { data: log, error: logErr } = await supabase
    .from('mission_attempt_logs')
    .select('id, mission_id, user_id, status')
    .eq('id', logId)
    .single();
  if (logErr || !log) return NextResponse.json({ error: 'log_not_found' }, { status: 404 });
  if (String(log.user_id) !== user.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (log.status !== 'running') return NextResponse.json({ error: 'already_finalised' }, { status: 409 });

  // ── load mission for server-side replay ─────────────────────────────
  const { data: missionRow, error: mErr } = await supabase
    .from('missions')
    .select('id, title, goal, steps, time_limit_s, par_time_s, difficulty, max_attempts, objects, success_conditions, fail_conditions')
    .eq('id', log.mission_id)
    .single();
  if (mErr || !missionRow) {
    return NextResponse.json({ error: 'mission_not_found' }, { status: 404 });
  }
  const mission = {
    id: missionRow.id,
    title: missionRow.title,
    goal: missionRow.goal ?? null,
    steps: missionRow.steps ?? [],
    timeLimitS: missionRow.time_limit_s,
    parTimeS:   missionRow.par_time_s ?? Math.max(10, Math.floor(missionRow.time_limit_s * 0.4)),
    difficulty: (missionRow.difficulty ?? 'medium') as 'easy'|'medium'|'hard'|'expert',
    maxAttempts: missionRow.max_attempts ?? 5,
    objects: (missionRow.objects ?? []) as MissionObject[],
    successConditions: (missionRow.success_conditions ?? []) as Condition[],
    failConditions:    (missionRow.fail_conditions ?? [])    as Condition[],
  };

  // ── canonical replay ─────────────────────────────────────────────────
  const replay = replayEpisode(mission, body.frames);
  const m = replay.metrics;

  // ── conditional trajectory upload ────────────────────────────────────
  let trajectoryPath: string | null = null;
  let trajectoryUploadError: string | null = null;
  const { data: settings } = await supabase
    .from('xp_settings')
    .select('trajectory_min_score')
    .eq('id', true)
    .single();
  const minScore = settings?.trajectory_min_score ?? 70;

  if (m.qualityScore >= minScore) {
    const envelope: TrajectoryEnvelope = {
      version: 1,
      mission_id: log.mission_id,
      user_id: user.id,
      recorded_at: new Date().toISOString(),
      time_limit_s: mission.timeLimitS,
      par_time_s: mission.parTimeS,
      frames: body.frames,
    };
    try {
      const gz = gzipSync(Buffer.from(JSON.stringify(envelope)));
      const path = `${user.id}/${logId}.json.gz`;
      const { error: upErr } = await supabase.storage
        .from('mission-trajectories')
        .upload(path, gz, {
          contentType: 'application/gzip',
          upsert: true,
        });
      if (upErr) {
        trajectoryUploadError = upErr.message;
      } else {
        trajectoryPath = path;
      }
    } catch (e) {
      trajectoryUploadError = (e as Error).message;
    }
  }

  // ── persist canonical metrics on the log row ────────────────────────
  const { data: updated, error: upErr } = await supabase
    .from('mission_attempt_logs')
    .update({
      completed_at:   new Date().toISOString(),
      status:         replay.status,
      result_reason:  replay.resultReason,
      elapsed_s:      replay.elapsedS,
      task_completion: m.sub.task_completion,
      time_efficiency: m.sub.time_efficiency,
      path_efficiency: m.sub.path_efficiency,
      smoothness:      m.sub.smoothness,
      stability:       m.sub.stability,
      economy:         m.sub.economy,
      quality_score:   m.qualityScore,
      stars:           m.stars,
      flag_timed_out:            m.flags.flag_timed_out,
      flag_never_touched_object: m.flags.flag_never_touched_object,
      flag_excessive_regrasps:   m.flags.flag_excessive_regrasps,
      flag_idle_dominant:        m.flags.flag_idle_dominant,
      flag_path_explosion:       m.flags.flag_path_explosion,
      flag_failure_recovered:    m.flags.flag_failure_recovered,
      flag_clipped_geometry:     m.flags.flag_clipped_geometry,
      flag_low_smoothness:       m.flags.flag_low_smoothness,
      path_length_m:           m.pathLengthM,
      optimal_path_m:          m.raw.optimalPathM,
      jerk_rms:                m.raw.jerkRMS,
      gripper_toggle_count:    m.raw.gripperToggleCount,
      velocity_reversal_count: m.raw.velocityReversalCount,
      idle_frame_ratio:        m.raw.idleFrameRatio,
      trajectory_path:         trajectoryPath,
    })
    .eq('id', logId)
    .select()
    .single();
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({
    data: updated,
    canonical: {
      status: replay.status,
      qualityScore: m.qualityScore,
      stars: m.stars,
      sub: m.sub,
      flags: m.flags,
    },
    trajectory: {
      stored: trajectoryPath !== null,
      path: trajectoryPath,
      threshold: minScore,
      error: trajectoryUploadError,
    },
  });
}

// ─── helpers ─────────────────────────────────────────────────────────────

function isVec3(v: unknown): v is [number, number, number] {
  return Array.isArray(v) && v.length === 3
    && typeof v[0] === 'number' && typeof v[1] === 'number' && typeof v[2] === 'number';
}
function isQuat(v: unknown): v is [number, number, number, number] {
  return Array.isArray(v) && v.length === 4
    && v.every((x) => typeof x === 'number');
}
function isValidFrame(f: unknown): f is TrajectoryFrame {
  if (!f || typeof f !== 'object') return false;
  const fr = f as Record<string, unknown>;
  if (typeof fr.t !== 'number' || !Number.isFinite(fr.t)) return false;
  if (!isVec3(fr.hand_p) || !isQuat(fr.hand_q)) return false;
  if (typeof fr.grip !== 'number' || !Number.isFinite(fr.grip)) return false;
  if (!Array.isArray(fr.objs)) return false;
  for (const o of fr.objs) {
    if (!o || typeof o !== 'object') return false;
    const obj = o as Record<string, unknown>;
    if (typeof obj.id !== 'string') return false;
    if (!isVec3(obj.p) || !isQuat(obj.q)) return false;
    if (!isVec3(obj.lv) || !isVec3(obj.av)) return false;
  }
  return true;
}
