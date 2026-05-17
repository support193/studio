// Admin home — mission list + "New mission" CTA.

import Link from 'next/link';
import { Plus, Clock, ListChecks, Play, BarChart3, Sparkles } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

interface MissionRow {
  id: string;
  title: string;
  goal: string | null;
  steps: string[];
  time_limit_s: number;
  updated_at: string;
}

export default async function AdminHomePage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('missions')
    .select('id, title, goal, steps, time_limit_s, updated_at')
    .order('updated_at', { ascending: false });

  const missions = (data ?? []) as MissionRow[];

  return (
    <div className="px-6 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-manrope text-[28px] font-semibold text-[#f8f9fa]">Missions</h1>
          <p className="font-manrope mt-1 text-[13px] text-[#939399]">
            Author and edit missions for the Studio.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/xp"
            className="flex items-center gap-2 rounded-full border border-[var(--st-border)] px-4 py-2 font-manrope text-[13px] text-[#a8a8b0] hover:border-[#5856d6] hover:text-white"
          >
            <Sparkles size={16} strokeWidth={1.75} />
            XP payouts
          </Link>
          <Link
            href="/admin/attempts"
            className="flex items-center gap-2 rounded-full border border-[var(--st-border)] px-4 py-2 font-manrope text-[13px] text-[#a8a8b0] hover:border-[#5856d6] hover:text-white"
          >
            <BarChart3 size={16} strokeWidth={1.75} />
            User attempts
          </Link>
          <Link
            href="/admin/missions/new"
            className="st-btn st-btn--primary rounded-full px-4 py-2 font-manrope text-[13px]"
          >
            <Plus size={16} strokeWidth={1.75} />
            New mission
          </Link>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-[6px] border border-red-700 bg-red-900/20 px-3 py-2 text-[12px] text-red-300">
          {error.message}
        </div>
      )}

      {missions.length === 0 ? (
        <div className="rounded-[16px] border border-dashed border-[var(--st-border)] py-16 text-center">
          <p className="font-manrope text-[14px] text-[var(--st-fg-2)]">No missions yet.</p>
          <Link
            href="/admin/missions/new"
            className="mt-3 inline-block font-manrope text-[13px] text-[#5856d6] hover:underline"
          >
            Create the first one →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {missions.map((m) => (
            <div
              key={m.id}
              className="rounded-[16px] border border-[var(--st-border)] bg-[var(--st-glass)] p-5 transition-colors hover:border-[var(--st-border-2)]"
            >
              <Link href={`/admin/missions/${m.id}`} className="block">
                <h3 className="font-manrope mb-1 text-[18px] font-semibold text-[#f8f9fa]">
                  {m.title}
                </h3>
                {m.goal && (
                  <p className="font-manrope mb-3 line-clamp-2 text-[13px] text-[#939399]">
                    {m.goal}
                  </p>
                )}
              </Link>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 text-[11px] text-[var(--st-fg-2)]">
                  <span className="flex items-center gap-1">
                    <ListChecks size={12} strokeWidth={1.75} />
                    {(m.steps?.length ?? 0)} steps
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock size={12} strokeWidth={1.75} />
                    {m.time_limit_s}s
                  </span>
                </div>
                <Link
                  href={`/missions/${m.id}/play`}
                  className="flex items-center gap-1 rounded-full bg-[#5856d6]/20 px-3 py-1 font-manrope text-[11px] font-medium text-[#c5c3ff] hover:bg-[#5856d6]/30"
                >
                  <Play size={11} strokeWidth={2} /> Play
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
