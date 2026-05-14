import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import MissionForm from '../MissionForm';

export const dynamic = 'force-dynamic';

export default async function EditMissionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('missions')
    .select('id, title, goal, steps, time_limit_s, par_time_s, difficulty, max_attempts, objects, success_conditions, fail_conditions')
    .eq('id', id)
    .single();
  if (error || !data) notFound();

  return (
    <MissionForm
      initial={{
        id: data.id,
        title: data.title,
        goal: data.goal ?? '',
        steps: data.steps ?? [],
        timeLimitS: data.time_limit_s,
        parTimeS:   data.par_time_s ?? Math.max(10, Math.floor(data.time_limit_s * 0.4)),
        difficulty: (data.difficulty ?? 'medium') as 'easy'|'medium'|'hard'|'expert',
        maxAttempts: data.max_attempts ?? 5,
        objects: data.objects ?? [],
        successConditions: data.success_conditions ?? [],
        failConditions: data.fail_conditions ?? [],
      }}
    />
  );
}
