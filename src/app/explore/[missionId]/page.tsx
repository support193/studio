// Explore task detail — the future per-task dataset product page.
// Public, server-rendered from views.  No augmentation/on-chain metrics
// (none exist): "verified" is represented honestly as "Stored".

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { deriveSkills } from '@/lib/missions/skills';
import type { Condition } from '@/lib/missions/types';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

interface MissionRow {
  id: string; title: string; goal: string | null;
  difficulty: 'easy' | 'medium' | 'hard' | 'expert';
  scenario: string | null; success_conditions: Condition[];
  time_limit_s: number; par_time_s: number;
  target_trajectories: number; trajectory_count: number;
  avg_score: number; last_active: string | null;
}
interface Hist { b90: number; b70: number; b55: number; b40: number; b0: number; total: number; }
interface TrajRow {
  id: string; operator: string; quality_score: number | null;
  stored: boolean; completed_at: string | null; status: string;
}

function rel(ts: string | null): string {
  if (!ts) return '—';
  const s = (Date.now() - new Date(ts).getTime()) / 1000;
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
function shortAddr(s: string): string {
  return /^0x[0-9a-fA-F]{6,}$/.test(s) ? `${s.slice(0, 6)}…${s.slice(-4)}` : s;
}

export default async function ExploreDetailPage({
  params, searchParams,
}: {
  params: Promise<{ missionId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { missionId } = await params;
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);
  const storedOnly = sp.stored === '1';
  const oq = (sp.oq ?? '').trim();

  const supabase = await createClient();
  const { data: mRaw } = await supabase
    .from('mission_explore_rows').select('*').eq('id', missionId).single();
  if (!mRaw) notFound();
  const m = mRaw as MissionRow;

  const { data: hRaw } = await supabase
    .from('mission_score_histogram').select('*').eq('mission_id', missionId).single();
  const h = (hRaw ?? { b90: 0, b70: 0, b55: 0, b40: 0, b0: 0, total: 0 }) as Hist;

  let listQ = supabase
    .from('mission_trajectory_list')
    .select('id, operator, quality_score, stored, completed_at, status', { count: 'exact' })
    .eq('mission_id', missionId);
  if (storedOnly) listQ = listQ.eq('stored', true);
  if (oq) listQ = listQ.ilike('operator', `%${oq}%`);
  const from = (page - 1) * PAGE_SIZE;
  const { data: listRaw, count } = await listQ
    .order('completed_at', { ascending: false, nullsFirst: false })
    .range(from, from + PAGE_SIZE - 1);
  const list = (listRaw ?? []) as TrajRow[];
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  const pct = (n: number) => (h.total > 0 ? Math.round((n / h.total) * 100) : 0);
  const buckets = [
    ['90-100', h.b90, '#22c55e'], ['70-89', h.b70, '#84cc16'],
    ['55-69', h.b55, '#facc15'], ['40-54', h.b40, '#f97316'],
    ['<40', h.b0, '#ef4444'],
  ] as const;
  const skills = deriveSkills(m.success_conditions);
  const fillPct = m.target_trajectories > 0
    ? Math.min(100, Math.round((m.trajectory_count / m.target_trajectories) * 100)) : 0;

  const lqs = (patch: Record<string, string>) => {
    const u = new URLSearchParams();
    if (storedOnly) u.set('stored', '1');
    if (oq) u.set('oq', oq);
    for (const [k, v] of Object.entries(patch)) { if (v) u.set(k, v); else u.delete(k); }
    const s = u.toString();
    return s ? `/explore/${missionId}?${s}` : `/explore/${missionId}`;
  };

  return (
    <div className="px-[24px] pb-[40px]">
      <div className="flex flex-col gap-[6px] py-[24px]">
        <div className="font-manrope text-[12px] text-[#737780]">
          <Link href="/explore" className="hover:text-[#f8f9fa]">Explore</Link> / {m.title}
        </div>
        <h1 className="font-manrope text-[28px] font-semibold leading-[1.2] text-[#f8f9fa]">{m.title}</h1>
        <div className="mt-[4px] flex flex-wrap items-center gap-[6px]">
          <span className="rounded-full border border-[#1f1f1f] px-[10px] py-[3px] font-manrope text-[11px] capitalize text-[#a8a8b0]">{m.difficulty}</span>
          {m.scenario && <span className="rounded-full border border-[#1f1f1f] px-[10px] py-[3px] font-manrope text-[11px] text-[#a8a8b0]">{m.scenario}</span>}
          {skills.map((s) => (
            <span key={s} className="rounded-full border border-[#7C5CFC]/40 bg-[#7C5CFC]/10 px-[10px] py-[3px] font-manrope text-[11px] text-[#a48dff]">{s}</span>
          ))}
        </div>
      </div>

      {/* Stat cards */}
      <div className="mb-[20px] grid grid-cols-1 gap-[12px] md:grid-cols-3">
        <div className="rounded-[12px] border border-[#1f1f1f] bg-[rgba(248,249,250,0.02)] p-[16px]">
          <div className="font-manrope text-[10px] font-semibold uppercase tracking-wider text-[#737780]">Trajectories</div>
          <div className="mt-[6px] font-manrope text-[22px] font-semibold text-[#f8f9fa]">
            {m.trajectory_count.toLocaleString()} <span className="text-[13px] text-[#737780]">/ {m.target_trajectories.toLocaleString()}</span>
          </div>
          <div className="mt-[8px] h-[6px] w-full overflow-hidden rounded-full bg-[rgba(248,249,250,0.06)]">
            <div className="h-full rounded-full bg-[#7C5CFC]" style={{ width: `${fillPct}%` }} />
          </div>
        </div>
        <div className="rounded-[12px] border border-[#1f1f1f] bg-[rgba(248,249,250,0.02)] p-[16px]">
          <div className="font-manrope text-[10px] font-semibold uppercase tracking-wider text-[#737780]">Avg Score</div>
          <div className="mt-[6px] font-manrope text-[22px] font-semibold text-[#f8f9fa]">{m.avg_score}</div>
        </div>
        <div className="rounded-[12px] border border-[#1f1f1f] bg-[rgba(248,249,250,0.02)] p-[16px]">
          <div className="font-manrope text-[10px] font-semibold uppercase tracking-wider text-[#737780]">Time Limit / Par</div>
          <div className="mt-[6px] font-manrope text-[22px] font-semibold text-[#f8f9fa]">{m.time_limit_s}s <span className="text-[13px] text-[#737780]">/ {m.par_time_s}s</span></div>
        </div>
      </div>

      {/* Description */}
      {m.goal && (
        <div className="mb-[20px] rounded-[12px] border border-[#1f1f1f] bg-[rgba(248,249,250,0.02)] p-[16px]">
          <div className="mb-[6px] font-manrope text-[10px] font-semibold uppercase tracking-wider text-[#737780]">Description</div>
          <p className="font-manrope text-[14px] leading-[1.5] text-[#d0d0d6]">{m.goal}</p>
        </div>
      )}

      {/* Score distribution */}
      <div className="mb-[20px] rounded-[12px] border border-[#1f1f1f] bg-[rgba(248,249,250,0.02)] p-[16px]">
        <div className="mb-[10px] font-manrope text-[10px] font-semibold uppercase tracking-wider text-[#737780]">
          Score distribution{h.total === 0 ? ' — no finalized runs yet' : ''}
        </div>
        <div className="flex h-[14px] w-full overflow-hidden rounded-full">
          {buckets.map(([lbl, n, c]) => (
            <div key={lbl} style={{ width: `${pct(n)}%`, background: c }} title={`${lbl}: ${pct(n)}%`} />
          ))}
        </div>
        <div className="mt-[8px] flex flex-wrap gap-[12px] font-manrope text-[11px] text-[#a8a8b0]">
          {buckets.map(([lbl, n, c]) => (
            <span key={lbl} className="flex items-center gap-[5px]">
              <span className="inline-block size-[8px] rounded-full" style={{ background: c }} /> {lbl} {pct(n)}%
            </span>
          ))}
        </div>
      </div>

      {/* Trajectory list */}
      <form action={`/explore/${missionId}`} method="get" className="mb-[12px] flex flex-wrap items-center gap-[8px]">
        <Link href={lqs({ stored: storedOnly ? '' : '1' })}
          className={`rounded-[8px] border px-[12px] py-[8px] font-manrope text-[12px] ${storedOnly ? 'border-[#7C5CFC] text-[#f8f9fa]' : 'border-[#1f1f1f] text-[#737780]'}`}>
          {storedOnly ? 'Stored only ✓' : 'Stored only'}
        </Link>
        <input name="oq" defaultValue={oq} placeholder="Search operator…"
          className="w-[220px] rounded-[8px] border border-[#1f1f1f] bg-transparent px-[12px] py-[8px] font-manrope text-[12px] text-[#f8f9fa] placeholder:text-[#737780] focus:outline-none" />
        {storedOnly && <input type="hidden" name="stored" value="1" />}
        <button className="rounded-[8px] border border-[#1f1f1f] px-[12px] py-[8px] font-manrope text-[12px] text-[#f8f9fa] hover:border-[#2a2a2a]">Search</button>
      </form>

      <div className="overflow-hidden rounded-[12px] border border-[#1f1f1f]">
        <div className="grid grid-cols-[80px_1fr_90px_100px_110px] gap-[12px] border-b border-[#1f1f1f] px-[16px] py-[12px] font-manrope text-[10px] font-semibold uppercase tracking-wider text-[#737780]">
          <span>#</span><span>Operator</span><span>Score</span><span>Data</span><span>Time</span>
        </div>
        {list.length === 0 ? (
          <div className="px-[16px] py-[40px] text-center font-manrope text-[13px] text-[#737780]">No trajectories yet.</div>
        ) : list.map((t, i) => (
          <div key={t.id} className="grid grid-cols-[80px_1fr_90px_100px_110px] items-center gap-[12px] border-b border-[#141414] px-[16px] py-[12px] font-manrope text-[12px] text-[#f8f9fa]">
            <span className="text-[#737780]">{from + i + 1}</span>
            <span className="truncate font-mono text-[11px] text-[#a8a8b0]">{shortAddr(t.operator)}</span>
            <span>{t.quality_score ?? '—'}</span>
            <span>
              {t.stored
                ? <span className="rounded-full border border-[#22c55e]/40 bg-[#22c55e]/10 px-[8px] py-[2px] text-[10px] text-[#22c55e]">Stored</span>
                : <span className="text-[10px] text-[#737780]">—</span>}
            </span>
            <span className="text-[#737780]">{rel(t.completed_at)}</span>
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="mt-[16px] flex items-center justify-center gap-[8px]">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <Link key={p} href={lqs({ page: String(p) })}
              className={`rounded-[6px] border px-[10px] py-[6px] font-manrope text-[12px] ${p === page ? 'border-[#7C5CFC] text-[#f8f9fa]' : 'border-[#1f1f1f] text-[#737780]'}`}>{p}</Link>
          ))}
        </div>
      )}
    </div>
  );
}
