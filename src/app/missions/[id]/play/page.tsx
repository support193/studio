// /missions/[id]/play — server entry for the mission player.
//
// On entry we atomically consume one attempt for the signed-in user via the
// `consume_mission_attempt` RPC.  If the user has already exhausted their
// allotment, we bounce them back to /missions.  A reload of this page counts
// as a new attempt; the in-session "Reset" button does not.

import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import MissionPlayer from './MissionPlayer';
import type { MissionDefinition } from '@/lib/missions/types';

export const dynamic = 'force-dynamic';

export default async function PlayMissionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('missions')
    .select('id, title, goal, steps, time_limit_s, max_attempts, objects, success_conditions, fail_conditions')
    .eq('id', id)
    .single();
  if (error || !data) notFound();

  // Middleware ensures we're authenticated here, but double-check defensively.
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/missions/${id}/play`);

  const { data: consumed, error: rpcError } = await supabase
    .rpc('consume_mission_attempt', { p_mission_id: id })
    .single<{ attempts: number; max_attempts: number }>();
  if (rpcError) {
    // attempts_exhausted (raised as P0001) is the expected "no more tries" path.
    // /missions list will render the card as disabled with "No tries left".
    redirect('/missions');
  }
  void consumed; // currently informational only; HUD reads max from mission

  const mission: MissionDefinition = {
    id: data.id,
    title: data.title,
    goal: data.goal ?? null,
    steps: data.steps ?? [],
    timeLimitS: data.time_limit_s,
    maxAttempts: data.max_attempts ?? 5,
    objects: data.objects ?? [],
    successConditions: data.success_conditions ?? [],
    failConditions: data.fail_conditions ?? [],
  };

  return <MissionPlayer mission={mission} />;
}
