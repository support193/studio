// Admin — list of every user attempt across every mission.
// Filterable by mission / user / status.  Joins auth.users via a
// SECURITY DEFINER RPC (admin_list_attempts) so we can surface emails.

import Link from 'next/link';
import { ArrowLeft, Star } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

interface AttemptRow {
  id: string;
  started_at: string;
  completed_at: string | null;
  status: 'running' | 'success' | 'failed' | 'timeout' | 'abandoned';
  elapsed_s: number | null;
  quality_score: number | null;
  stars: number | null;
  xp_awarded: number | null;
  user_id: string;
  user_email: string | null;
  mission_id: string;
  mission_title: string;
  mission_difficulty: string;
}

interface TrajectoryPath { id: string; trajectory_path: string | null; }

interface MissionOption { id: string; title: string; }
interface UserOption    { user_id: string; user_email: string | null; attempt_count: number; }

export default async function AdminAttemptsPage({
  searchParams,
}: {
  searchParams: Promise<{ mission?: string; user?: string; status?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const missionFilter = sp.mission && sp.mission !== 'all' ? sp.mission : null;
  const userFilter    = sp.user    && sp.user    !== 'all' ? sp.user    : null;
  const statusFilter  = sp.status  && sp.status  !== 'all' ? sp.status  : null;
  const page          = Math.max(0, parseInt(sp.page ?? '0') || 0);

  const supabase = await createClient();

  // Three parallel calls: rows, total count, filter dropdown sources.
  const [attemptsRes, countRes, missionsRes, usersRes] = await Promise.all([
    supabase.rpc('admin_list_attempts', {
      p_limit:      PAGE_SIZE,
      p_offset:     page * PAGE_SIZE,
      p_mission_id: missionFilter,
      p_user_id:    userFilter,
      p_status:     statusFilter,
    }),
    supabase.rpc('admin_count_attempts', {
      p_mission_id: missionFilter,
      p_user_id:    userFilter,
      p_status:     statusFilter,
    }),
    supabase.from('missions').select('id, title').order('title', { ascending: true }),
    supabase.rpc('admin_list_users_with_attempts'),
  ]);

  const rows: AttemptRow[] = (attemptsRes.data ?? []) as AttemptRow[];
  const total = (countRes.data as number | null) ?? 0;
  const missions: MissionOption[] = (missionsRes.data ?? []) as MissionOption[];
  const users:    UserOption[]    = (usersRes.data ?? []) as UserOption[];

  // Look up trajectory presence for the rows on this page.  mission_attempt_logs
  // is RLS-gated to own/admin; we're admin here so we see all.
  const ids = rows.map((r) => r.id);
  const { data: trajRows } = ids.length > 0
    ? await supabase.from('mission_attempt_logs').select('id, trajectory_path').in('id', ids)
    : { data: [] as TrajectoryPath[] };
  const trajectoryMap = new Map<string, string | null>(
    (trajRows ?? []).map((r) => [r.id, r.trajectory_path]),
  );

  const error = attemptsRes.error?.message ?? countRes.error?.message ?? null;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="px-6 py-8">
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/admin"
          className="flex size-[32px] items-center justify-center rounded-full border border-[#1f1f1f] text-[#a8a8b0] hover:text-white"
        >
          <ArrowLeft size={14} />
        </Link>
        <div>
          <h1 className="font-manrope text-[24px] font-semibold text-[#f8f9fa]">User attempts</h1>
          <p className="font-manrope text-[12px] text-[#737780]">
            Every play session ever recorded.  {total.toLocaleString()} total · page {page + 1} of {pageCount}.
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-[6px] border border-red-700 bg-red-900/20 px-3 py-2 text-[12px] text-red-300">
          {error}
        </div>
      )}

      {/* Filters — form submission updates the URL, page server-re-renders. */}
      <form className="mb-6 flex flex-wrap items-end gap-3">
        <FilterSelect
          name="mission"
          label="Mission"
          value={sp.mission ?? 'all'}
          options={[{ value: 'all', label: 'All missions' },
                    ...missions.map((m) => ({ value: m.id, label: m.title }))]}
        />
        <FilterSelect
          name="user"
          label="User"
          value={sp.user ?? 'all'}
          options={[{ value: 'all', label: 'All users' },
                    ...users.map((u) => ({
                      value: u.user_id,
                      label: `${u.user_email ?? '(deleted)'}  ·  ${u.attempt_count}`,
                    }))]}
        />
        <FilterSelect
          name="status"
          label="Status"
          value={sp.status ?? 'all'}
          options={[
            { value: 'all',     label: 'All statuses' },
            { value: 'success', label: 'Success' },
            { value: 'failed',  label: 'Failed' },
            { value: 'timeout', label: 'Timeout' },
            { value: 'running', label: 'Running / abandoned' },
          ]}
        />
        <button
          type="submit"
          className="rounded-full border border-[#7C5CFC] bg-[#7C5CFC]/15 px-4 py-2 font-manrope text-[12px] font-medium text-[#a48dff] hover:bg-[#7C5CFC]/25"
        >
          Apply
        </button>
        <Link
          href="/admin/attempts"
          className="rounded-full border border-[#1f1f1f] px-4 py-2 font-manrope text-[12px] text-[#737780] hover:text-white"
        >
          Reset
        </Link>
      </form>

      {/* Table */}
      <div className="overflow-hidden rounded-[12px] border border-[#1f1f1f]">
        <table className="w-full text-left">
          <thead className="bg-[rgba(248,249,250,0.03)]">
            <tr>
              <Th>When</Th>
              <Th>Mission</Th>
              <Th>User</Th>
              <Th>Status</Th>
              <Th>Time</Th>
              <Th>Quality</Th>
              <Th>Stars</Th>
              <Th>XP</Th>
              <Th>Data</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-12 text-center font-manrope text-[13px] text-[#737780]">
                  No attempts match these filters yet.
                </td>
              </tr>
            ) : rows.map((r) => (
              <tr key={r.id} className="border-t border-[#1a1a1a]">
                <Td>
                  <div className="font-mono text-[11px] text-[#f8f9fa]">{formatDate(r.started_at)}</div>
                  <div className="font-mono text-[10px] text-[#737780]">{formatTime(r.started_at)}</div>
                </Td>
                <Td>
                  <div className="flex flex-col">
                    <span className="font-manrope text-[13px] text-[#f8f9fa]">{r.mission_title}</span>
                    <span className="font-manrope text-[10px] uppercase tracking-wider text-[#737780]">
                      {r.mission_difficulty}
                    </span>
                  </div>
                </Td>
                <Td>
                  <span className="font-manrope text-[12px] text-[#a8a8b0]">
                    {r.user_email ?? <span className="italic text-[#535357]">(deleted)</span>}
                  </span>
                </Td>
                <Td><StatusPill status={r.status} /></Td>
                <Td>
                  <span className="font-mono text-[12px] text-[#a8a8b0]">
                    {r.elapsed_s !== null ? `${Number(r.elapsed_s).toFixed(1)}s` : '—'}
                  </span>
                </Td>
                <Td>
                  <span className="font-mono text-[13px] font-semibold text-[#f8f9fa]">
                    {r.quality_score ?? '—'}
                  </span>
                </Td>
                <Td>
                  <div className="flex items-center gap-0.5">
                    {[1, 2, 3].map((i) => (
                      <Star
                        key={i}
                        size={12}
                        className={r.stars && i <= r.stars ? 'text-[#FACC15]' : 'text-[#2a2a35]'}
                        fill={r.stars && i <= r.stars ? '#FACC15' : 'none'}
                      />
                    ))}
                  </div>
                </Td>
                <Td>
                  <span className="font-mono text-[12px] text-[#a48dff]">
                    {r.xp_awarded ? `+${r.xp_awarded}` : '—'}
                  </span>
                </Td>
                <Td>
                  {trajectoryMap.get(r.id) ? (
                    <a
                      href={`/api/admin/trajectory/${r.id}`}
                      className="font-manrope text-[12px] text-[#a48dff] hover:underline"
                    >
                      Download
                    </a>
                  ) : (
                    <span className="font-manrope text-[11px] text-[#535357]">—</span>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pageCount > 1 && (
        <div className="mt-4 flex justify-center gap-2">
          {Array.from({ length: pageCount }, (_, i) => i).slice(
            Math.max(0, page - 3),
            Math.min(pageCount, page + 4),
          ).map((p) => (
            <PageLink key={p} page={p} active={p === page} searchParams={sp} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── pieces ───────────────────────────────────────────────────────────────

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 font-manrope text-[10px] font-semibold uppercase tracking-wider text-[#737780]">
      {children}
    </th>
  );
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3 align-top">{children}</td>;
}

function FilterSelect({
  name, label, value, options,
}: {
  name: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-manrope text-[10px] uppercase tracking-wider text-[#737780]">{label}</span>
      <select
        name={name}
        defaultValue={value}
        className="rounded-[8px] border border-[#1f1f1f] bg-[#0a0a0a] px-3 py-2 font-manrope text-[12px] text-[#f8f9fa] focus:border-[#7C5CFC] focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-[#0a0a0a]">{o.label}</option>
        ))}
      </select>
    </label>
  );
}

function StatusPill({ status }: { status: AttemptRow['status'] }) {
  const palette: Record<AttemptRow['status'], { bg: string; text: string }> = {
    success:   { bg: 'bg-[#22c55e]/15', text: 'text-[#22c55e]' },
    failed:    { bg: 'bg-[#ef4444]/15', text: 'text-[#ef4444]' },
    timeout:   { bg: 'bg-[#facc15]/15', text: 'text-[#facc15]' },
    running:   { bg: 'bg-[#737780]/15', text: 'text-[#a8a8b0]' },
    abandoned: { bg: 'bg-[#737780]/15', text: 'text-[#a8a8b0]' },
  };
  const c = palette[status];
  return (
    <span className={`inline-flex rounded-[6px] px-2 py-0.5 font-manrope text-[11px] font-medium capitalize ${c.bg} ${c.text}`}>
      {status}
    </span>
  );
}

function PageLink({
  page, active, searchParams,
}: {
  page: number; active: boolean; searchParams: { mission?: string; user?: string; status?: string };
}) {
  const params = new URLSearchParams();
  if (searchParams.mission) params.set('mission', searchParams.mission);
  if (searchParams.user)    params.set('user', searchParams.user);
  if (searchParams.status)  params.set('status', searchParams.status);
  if (page > 0) params.set('page', String(page));
  const href = `/admin/attempts${params.toString() ? '?' + params.toString() : ''}`;
  return (
    <Link
      href={href}
      className={[
        'flex size-[32px] items-center justify-center rounded-[8px] font-manrope text-[12px] font-medium',
        active
          ? 'border border-[#7C5CFC] bg-[#7C5CFC]/20 text-white'
          : 'border border-[#1f1f1f] text-[#a8a8b0] hover:text-white',
      ].join(' ')}
    >
      {page + 1}
    </Link>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
}
function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}
