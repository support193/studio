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
    .select('id, title, goal, steps, time_limit_s, objects, success_conditions, fail_conditions')
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
        objects: data.objects ?? [],
        successConditions: data.success_conditions ?? [],
        failConditions: data.fail_conditions ?? [],
      }}
    />
  );
}
