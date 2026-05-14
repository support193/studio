// Finalise a mission_attempt_logs row.
//
// Called by the client at the end of an episode (success / failed / timeout).
// Computes XP server-side (so clients can't lie about their own rewards) and
// persists every sub-metric, flag, and raw signal.  Returns the resulting
// row so the result modal can display authoritative XP/stars.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { computeXp } from '@/lib/missions/metrics';
import type { EpisodeFlags, SubMetrics } from '@/lib/missions/metrics';
import type { Difficulty } from '@/lib/missions/types';

interface FinishBody {
  status: 'success' | 'failed' | 'timeout';
  resultReason?: string | null;
  elapsedS: number;
  sub: SubMetrics;
  qualityScore: number;
  stars: 0 | 1 | 2 | 3;
  flags: EpisodeFlags;
  raw: {
    pathLengthM: number;
    optimalPathM: number;
    jerkRMS: number;
    gripperToggleCount: number;
    velocityReversalCount: number;
    idleFrameRatio: number;
  };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: logId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  let body: FinishBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  // Look up the log row + mission difficulty + previous best stars.
  const { data: log, error: logErr } = await supabase
    .from('mission_attempt_logs')
    .select('id, mission_id, user_id, status')
    .eq('id', logId)
    .single();
  if (logErr || !log) {
    return NextResponse.json({ error: 'log_not_found' }, { status: 404 });
  }
  if (log.user_id !== user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  if (log.status !== 'running') {
    return NextResponse.json({ error: 'already_finalised' }, { status: 409 });
  }

  const { data: mission } = await supabase
    .from('missions')
    .select('difficulty')
    .eq('id', log.mission_id)
    .single();
  const difficulty: Difficulty = (mission?.difficulty ?? 'medium') as Difficulty;

  const { data: prior } = await supabase
    .from('mission_attempt_logs')
    .select('stars')
    .eq('mission_id', log.mission_id)
    .eq('user_id', user.id)
    .neq('id', logId)
    .order('stars', { ascending: false })
    .limit(1)
    .maybeSingle();
  const previousBestStars = (prior?.stars ?? 0) as 0 | 1 | 2 | 3;

  const xp = computeXp(
    { difficulty },
    {
      stars: body.stars,
      qualityScore: body.qualityScore,
      flags: body.flags,
      // unused fields satisfied to keep computeXp signature simple
      elapsedS: body.elapsedS,
      pathLengthM: body.raw.pathLengthM,
      meanSpeedMps: 0,
      smoothnessScore: body.sub.smoothness,
      sub: body.sub,
      raw: {
        jerkRMS: body.raw.jerkRMS,
        gripperToggleCount: body.raw.gripperToggleCount,
        velocityReversalCount: body.raw.velocityReversalCount,
        idleFrameRatio: body.raw.idleFrameRatio,
        optimalPathM: body.raw.optimalPathM,
      },
    },
    previousBestStars,
  );

  const { data: updated, error: upErr } = await supabase
    .from('mission_attempt_logs')
    .update({
      completed_at:   new Date().toISOString(),
      status:         body.status,
      result_reason:  body.resultReason ?? null,
      elapsed_s:      body.elapsedS,
      task_completion: body.sub.task_completion,
      time_efficiency: body.sub.time_efficiency,
      path_efficiency: body.sub.path_efficiency,
      smoothness:      body.sub.smoothness,
      stability:       body.sub.stability,
      economy:         body.sub.economy,
      quality_score:   body.qualityScore,
      stars:           body.stars,
      xp_awarded:      xp,
      flag_timed_out:            body.flags.flag_timed_out,
      flag_never_touched_object: body.flags.flag_never_touched_object,
      flag_excessive_regrasps:   body.flags.flag_excessive_regrasps,
      flag_idle_dominant:        body.flags.flag_idle_dominant,
      flag_path_explosion:       body.flags.flag_path_explosion,
      flag_failure_recovered:    body.flags.flag_failure_recovered,
      flag_clipped_geometry:     body.flags.flag_clipped_geometry,
      flag_low_smoothness:       body.flags.flag_low_smoothness,
      path_length_m:           body.raw.pathLengthM,
      optimal_path_m:          body.raw.optimalPathM,
      jerk_rms:                body.raw.jerkRMS,
      gripper_toggle_count:    body.raw.gripperToggleCount,
      velocity_reversal_count: body.raw.velocityReversalCount,
      idle_frame_ratio:        body.raw.idleFrameRatio,
    })
    .eq('id', logId)
    .select()
    .single();
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }
  return NextResponse.json({ data: updated, xp });
}
