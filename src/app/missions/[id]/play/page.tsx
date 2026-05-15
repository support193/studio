// /missions/[id]/play — server entry for the mission player.
//
// Anonymous visitors are allowed in.  When they hit Play we still render
// the player but pass logId=null, so the in-browser experience works while
// no attempts/XP get tracked.  Logged-in users (Turnkey wallet OR admin
// email) get an attempt counter consumed via the consume_mission_attempt
// RPC and a mission_attempt_logs row created up front.

import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getServerUser } from '@/lib/auth/server-user';
import MissionPlayer from './MissionPlayer';
import type { MissionDefinition } from '@/lib/missions/types';

export const dynamic = 'force-dynamic';

export default async function PlayMissionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Mission row read with the user-authed client — missions SELECT is open
  // to anon so this works for everyone.
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('missions')
    .select('id, title, goal, steps, time_limit_s, par_time_s, difficulty, max_attempts, objects, success_conditions, fail_conditions')
    .eq('id', id)
    .single();
  if (error || !data) notFound();

  const user = await getServerUser();
  let logId: string | null = null;

  if (user) {
    const admin = createAdminClient();

    // Atomic attempt-counter increment + max check.
    const { error: rpcErr } = await admin
      .rpc('consume_mission_attempt', { p_user_id: user.id, p_mission_id: id })
      .single();
    if (rpcErr) {
      // attempts_exhausted (P0001) or mission_not_found → bounce.
      redirect('/missions');
    }

    // Create the attempt log row (status starts at 'running').
    const { data: log, error: logErr } = await admin
      .from('mission_attempt_logs')
      .insert({ mission_id: id, user_id: user.id })
      .select('id')
      .single();
    if (logErr) {
      console.error('mission_attempt_logs insert failed:', logErr);
    } else {
      logId = log.id;
    }
  }

  const mission: MissionDefinition = {
    id: data.id,
    title: data.title,
    goal: data.goal ?? null,
    steps: data.steps ?? [],
    timeLimitS: data.time_limit_s,
    parTimeS:   data.par_time_s ?? Math.max(10, Math.floor(data.time_limit_s * 0.4)),
    difficulty: (data.difficulty ?? 'medium') as 'easy'|'medium'|'hard'|'expert',
    maxAttempts: data.max_attempts ?? 5,
    objects: data.objects ?? [],
    successConditions: data.success_conditions ?? [],
    failConditions: data.fail_conditions ?? [],
  };

  return <MissionPlayer mission={mission} logId={logId} />;
}
