// /missions/[id]/play — 미션 플레이어 페이지.
// Server: missions row 페치 → MissionPlayer (client) 에 전달.

import { notFound } from 'next/navigation';
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
    .select('id, title, goal, steps, time_limit_s, objects, success_conditions, fail_conditions')
    .eq('id', id)
    .single();
  if (error || !data) notFound();

  const mission: MissionDefinition = {
    id: data.id,
    title: data.title,
    goal: data.goal ?? null,
    steps: data.steps ?? [],
    timeLimitS: data.time_limit_s,
    objects: data.objects ?? [],
    successConditions: data.success_conditions ?? [],
    failConditions: data.fail_conditions ?? [],
  };

  return <MissionPlayer mission={mission} />;
}
