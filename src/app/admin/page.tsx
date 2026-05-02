// Admin home — mission list + "New mission" CTA.

import Link from 'next/link';
import { Plus, Clock, ListChecks } from 'lucide-react';
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
        <Link
          href="/admin/missions/new"
          className="flex items-center gap-2 rounded-full border border-[#040404] bg-[rgba(248,249,250,0.06)] px-4 py-2 font-manrope text-[13px] text-[#f8f9fa] hover:bg-[rgba(248,249,250,0.1)]"
        >
          <Plus size={16} strokeWidth={1.75} />
          New mission
        </Link>
      </div>

      {error && (
        <div className="mb-6 rounded-[6px] border border-red-700 bg-red-900/20 px-3 py-2 text-[12px] text-red-300">
          {error.message}
        </div>
      )}

      {missions.length === 0 ? (
        <div className="rounded-[16px] border border-dashed border-[#1f1f1f] py-16 text-center">
          <p className="font-manrope text-[14px] text-[#737780]">No missions yet.</p>
          <Link
            href="/admin/missions/new"
            className="mt-3 inline-block font-manrope text-[13px] text-[#7C5CFC] hover:underline"
          >
            Create the first one →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {missions.map((m) => (
            <Link
              key={m.id}
              href={`/admin/missions/${m.id}`}
              className="rounded-[16px] border border-[rgba(248,249,250,0.1)] bg-[rgba(248,249,250,0.02)] p-5 transition-colors hover:border-[rgba(248,249,250,0.2)]"
            >
              <h3 className="font-manrope mb-1 text-[18px] font-semibold text-[#f8f9fa]">
                {m.title}
              </h3>
              {m.goal && (
                <p className="font-manrope mb-3 line-clamp-2 text-[13px] text-[#939399]">
                  {m.goal}
                </p>
              )}
              <div className="flex items-center gap-4 text-[11px] text-[#737780]">
                <span className="flex items-center gap-1">
                  <ListChecks size={12} strokeWidth={1.75} />
                  {(m.steps?.length ?? 0)} steps
                </span>
                <span className="flex items-center gap-1">
                  <Clock size={12} strokeWidth={1.75} />
                  {m.time_limit_s}s
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
