// Explore — public data catalog.  Server-rendered from Postgres aggregation
// views (anon read).  Filtering / sort / pagination via URL searchParams,
// no client JS.  Mirrors Axis Robotics' Explore list.

import Link from 'next/link';
import { Search } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { deriveSkills } from '@/lib/missions/skills';
import type { Condition } from '@/lib/missions/types';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;
const DIFFICULTIES = ['easy', 'medium', 'hard', 'expert'] as const;

interface RowDB {
  id: string;
  title: string;
  difficulty: 'easy' | 'medium' | 'hard' | 'expert';
  scenario: string | null;
  success_conditions: Condition[];
  target_trajectories: number;
  trajectory_count: number;
  avg_score: number;
  last_active: string | null;
}
interface TotalsDB {
  total_tasks: number;
  total_trajectories: number;
  contributors: number;
  avg_score: number;
}
interface DailyDB { day: string; trajectory_count: number; }

function rel(ts: string | null): string {
  if (!ts) return '—';
  const s = (Date.now() - new Date(ts).getTime()) / 1000;
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? '').trim();
  const diff = DIFFICULTIES.includes(sp.diff as typeof DIFFICULTIES[number])
    ? (sp.diff as string) : '';
  const sort = sp.sort === 'data' ? 'data' : 'score';
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);

  const supabase = await createClient();
  const [{ data: totalsRaw }, { data: dailyRaw }, { data: rowsRaw }] = await Promise.all([
    supabase.from('explore_totals').select('*').single(),
    supabase.from('explore_daily').select('*'),
    supabase.from('mission_explore_rows').select('*'),
  ]);

  const totals = (totalsRaw ?? { total_tasks: 0, total_trajectories: 0, contributors: 0, avg_score: 0 }) as TotalsDB;
  const daily = (dailyRaw ?? []) as DailyDB[];
  let rows = (rowsRaw ?? []) as RowDB[];

  if (q) rows = rows.filter((r) => r.title.toLowerCase().includes(q.toLowerCase()));
  if (diff) rows = rows.filter((r) => r.difficulty === diff);
  rows.sort((a, b) => sort === 'data'
    ? b.trajectory_count - a.trajectory_count
    : b.avg_score - a.avg_score);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const clamped = Math.min(page, totalPages);
  const pageRows = rows.slice((clamped - 1) * PAGE_SIZE, clamped * PAGE_SIZE);

  const byDiff = DIFFICULTIES.map((d) => ({
    d, n: (rowsRaw ?? []).filter((r: RowDB) => r.difficulty === d).length,
  }));
  const maxDaily = Math.max(1, ...daily.map((x) => x.trajectory_count));

  const qs = (patch: Record<string, string>) => {
    const u = new URLSearchParams();
    if (q) u.set('q', q);
    if (diff) u.set('diff', diff);
    if (sort !== 'score') u.set('sort', sort);
    for (const [k, v] of Object.entries(patch)) v ? u.set(k, v) : u.delete(k);
    const s = u.toString();
    return s ? `/explore?${s}` : '/explore';
  };

  return (
    <div className="px-[24px] pb-[40px]">
      <div className="flex flex-col gap-[8px] py-[32px]">
        <h1 className="font-manrope text-[32px] font-semibold leading-[1.2] text-[#f8f9fa]">Explore</h1>
        <p className="font-manrope text-[14px] leading-[1.4] text-[#939399]">
          Browse every task, its collected trajectory data and quality.
        </p>
      </div>

      {/* Stats */}
      <div className="mb-[28px] grid grid-cols-2 gap-[12px] md:grid-cols-4">
        {[
          ['Total Tasks', totals.total_tasks.toLocaleString()],
          ['Total Trajectories', totals.total_trajectories.toLocaleString()],
          ['Contributors', totals.contributors.toLocaleString()],
          ['Avg Score', String(totals.avg_score)],
        ].map(([label, val]) => (
          <div key={label} className="rounded-[12px] border border-[#1f1f1f] bg-[rgba(248,249,250,0.02)] p-[16px]">
            <div className="font-manrope text-[10px] font-semibold uppercase tracking-wider text-[#737780]">{label}</div>
            <div className="mt-[6px] font-manrope text-[24px] font-semibold text-[#f8f9fa]">{val}</div>
          </div>
        ))}
      </div>

      {/* Daily chart + difficulty breakdown */}
      <div className="mb-[28px] grid grid-cols-1 gap-[12px] lg:grid-cols-3">
        <div className="rounded-[12px] border border-[#1f1f1f] bg-[rgba(248,249,250,0.02)] p-[16px] lg:col-span-2">
          <div className="mb-[12px] font-manrope text-[10px] font-semibold uppercase tracking-wider text-[#737780]">
            Trajectories / day — last 14 days
          </div>
          <div className="flex h-[80px] items-end gap-[4px]">
            {daily.map((x) => (
              <div key={x.day} className="flex-1 rounded-t-[2px] bg-[#7C5CFC]"
                style={{ height: `${Math.max(2, (x.trajectory_count / maxDaily) * 100)}%` }}
                title={`${x.day}: ${x.trajectory_count}`} />
            ))}
          </div>
        </div>
        <div className="rounded-[12px] border border-[#1f1f1f] bg-[rgba(248,249,250,0.02)] p-[16px]">
          <div className="mb-[12px] font-manrope text-[10px] font-semibold uppercase tracking-wider text-[#737780]">By difficulty</div>
          <div className="flex flex-col gap-[8px]">
            {byDiff.map(({ d, n }) => (
              <div key={d} className="flex items-center justify-between font-manrope text-[12px]">
                <span className="capitalize text-[#a8a8b0]">{d}</span>
                <span className="text-[#f8f9fa]">{n}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Filters */}
      <form className="mb-[16px] flex flex-wrap items-center gap-[8px]" action="/explore" method="get">
        <div className="flex w-[260px] items-center gap-[8px] rounded-[8px] border border-[#1f1f1f] px-[12px] py-[8px]">
          <Search size={16} strokeWidth={1.5} className="text-[#737780]" />
          <input name="q" defaultValue={q} placeholder="Search tasks..."
            className="flex-1 bg-transparent font-manrope text-[12px] text-[#f8f9fa] placeholder:text-[#737780] focus:outline-none" />
        </div>
        {diff && <input type="hidden" name="diff" value={diff} />}
        {sort !== 'score' && <input type="hidden" name="sort" value={sort} />}
        <button className="rounded-[8px] border border-[#1f1f1f] px-[12px] py-[8px] font-manrope text-[12px] text-[#f8f9fa] hover:border-[#2a2a2a]">Search</button>
        <Link href={qs({ diff: '' })} className={`rounded-[8px] border px-[12px] py-[8px] font-manrope text-[12px] ${!diff ? 'border-[#7C5CFC] text-[#f8f9fa]' : 'border-[#1f1f1f] text-[#737780]'}`}>All</Link>
        {DIFFICULTIES.map((d) => (
          <Link key={d} href={qs({ diff: d })} className={`rounded-[8px] border px-[12px] py-[8px] font-manrope text-[12px] capitalize ${diff === d ? 'border-[#7C5CFC] text-[#f8f9fa]' : 'border-[#1f1f1f] text-[#737780]'}`}>{d}</Link>
        ))}
        <Link href={qs({ sort: sort === 'score' ? 'data' : 'score' })} className="ml-auto rounded-[8px] border border-[#1f1f1f] px-[12px] py-[8px] font-manrope text-[12px] text-[#a8a8b0]">
          Sort: {sort === 'score' ? 'Avg Score' : 'Data'}
        </Link>
      </form>

      {/* Table */}
      <div className="overflow-hidden rounded-[12px] border border-[#1f1f1f]">
        <div className="grid grid-cols-[60px_1fr_90px_140px_90px_120px_110px] gap-[12px] border-b border-[#1f1f1f] px-[16px] py-[12px] font-manrope text-[10px] font-semibold uppercase tracking-wider text-[#737780]">
          <span>#</span><span>Task</span><span>Difficulty</span><span>Skills</span><span>Avg Score</span><span>Data</span><span>Last Active</span>
        </div>
        {pageRows.length === 0 ? (
          <div className="px-[16px] py-[40px] text-center font-manrope text-[13px] text-[#737780]">No tasks match.</div>
        ) : pageRows.map((r, i) => (
          <Link key={r.id} href={`/explore/${r.id}`}
            className="grid grid-cols-[60px_1fr_90px_140px_90px_120px_110px] items-center gap-[12px] border-b border-[#141414] px-[16px] py-[14px] font-manrope text-[12px] text-[#f8f9fa] transition-colors hover:bg-[rgba(248,249,250,0.03)]">
            <span className="text-[#737780]">{(clamped - 1) * PAGE_SIZE + i + 1}</span>
            <span className="truncate">{r.title}</span>
            <span className="capitalize text-[#a8a8b0]">{r.difficulty}</span>
            <span className="flex flex-wrap gap-[4px]">
              {deriveSkills(r.success_conditions).map((s) => (
                <span key={s} className="rounded-full border border-[#7C5CFC]/40 bg-[#7C5CFC]/10 px-[8px] py-[2px] text-[10px] text-[#a48dff]">{s}</span>
              ))}
            </span>
            <span>{r.avg_score}</span>
            <span className="text-[#a8a8b0]">{r.trajectory_count.toLocaleString()} / {r.target_trajectories.toLocaleString()}</span>
            <span className="text-[#737780]">{rel(r.last_active)}</span>
          </Link>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-[16px] flex items-center justify-center gap-[8px]">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <Link key={p} href={qs({ page: String(p) })}
              className={`rounded-[6px] border px-[10px] py-[6px] font-manrope text-[12px] ${p === clamped ? 'border-[#7C5CFC] text-[#f8f9fa]' : 'border-[#1f1f1f] text-[#737780]'}`}>{p}</Link>
          ))}
        </div>
      )}
    </div>
  );
}
