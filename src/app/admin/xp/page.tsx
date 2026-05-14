// Admin XP — weekly pool size + distribution day setting, list of pending
// (undistributed) weeks with a "Distribute" button each, and full history
// of past distributions with drill-down.
//
// Trigger is fully manual: admin clicks "Distribute" on the row for the week
// they want to pay out.  Background cron is intentionally not wired (user
// request — chose manual-only).

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import {
  saveSettings,
  distributeWeek,
} from './actions';

export const dynamic = 'force-dynamic';

interface Settings { weekly_pool_xp: number; distribution_dow: number; trajectory_min_score: number; updated_at: string; }
interface PendingWeek {
  week_start: string;
  week_end: string;
  participant_count: number;
  total_score: number;
}
interface DistributionRow {
  id: string;
  week_start: string;
  week_end: string;
  distributed_at: string;
  pool_xp: number;
  total_score: number;
  participant_count: number;
  distributor_email: string | null;
}

const DOW_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default async function AdminXpPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; distributed?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();

  const [
    { data: settingsRaw },
    { data: pendingRaw },
    { data: historyRaw },
  ] = await Promise.all([
    supabase.from('xp_settings').select('weekly_pool_xp, distribution_dow, trajectory_min_score, updated_at').eq('id', true).single(),
    supabase.rpc('admin_pending_weeks'),
    supabase.rpc('admin_list_distributions'),
  ]);

  const settings: Settings | null = settingsRaw as Settings | null;
  const pending: PendingWeek[] = (pendingRaw ?? []) as PendingWeek[];
  const history: DistributionRow[] = (historyRaw ?? []) as DistributionRow[];

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
          <h1 className="font-manrope text-[24px] font-semibold text-[#f8f9fa]">XP Distribution</h1>
          <p className="font-manrope text-[12px] text-[#737780]">
            Weekly XP is paid out manually — the pool is split across players proportionally to the sum of their attempt scores for that week (Mon 00:00 UTC → next Mon 00:00 UTC).
          </p>
        </div>
      </div>

      {sp.saved && (
        <Toast tone="ok" message="Settings saved." />
      )}
      {sp.distributed && (
        <Toast tone="ok" message={`Distribution complete for week of ${formatDate(sp.distributed)}.`} />
      )}
      {sp.error && (
        <Toast tone="err" message={decodeURIComponent(sp.error)} />
      )}

      {/* ─── Settings ────────────────────────────────────────────────── */}
      <section className="mb-10 rounded-[12px] border border-[#1f1f1f] bg-[rgba(248,249,250,0.02)] p-6">
        <h2 className="mb-4 font-manrope text-[16px] font-semibold text-[#f8f9fa]">Settings</h2>
        <form action={saveSettings} className="flex flex-wrap items-end gap-6">
          <label className="flex flex-col gap-1">
            <span className="font-manrope text-[11px] uppercase tracking-wider text-[#737780]">
              Weekly pool (XP)
            </span>
            <input
              name="pool"
              type="number"
              min={0}
              max={10000000}
              defaultValue={settings?.weekly_pool_xp ?? 10000}
              className="w-48 rounded-[8px] border border-[#1f1f1f] bg-transparent px-3 py-2 font-mono text-[14px] text-[#f8f9fa] focus:border-[#7C5CFC] focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-manrope text-[11px] uppercase tracking-wider text-[#737780]">
              Planned distribution day
            </span>
            <select
              name="dow"
              defaultValue={settings?.distribution_dow ?? 1}
              className="w-48 rounded-[8px] border border-[#1f1f1f] bg-[#0a0a0a] px-3 py-2 font-manrope text-[14px] text-[#f8f9fa] focus:border-[#7C5CFC] focus:outline-none"
            >
              {DOW_LABELS.map((label, i) => (
                <option key={i} value={i} className="bg-[#0a0a0a]">{label}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-manrope text-[11px] uppercase tracking-wider text-[#737780]">
              Save trajectory if quality ≥
            </span>
            <input
              name="trajectory_min"
              type="number"
              min={0}
              max={100}
              defaultValue={settings?.trajectory_min_score ?? 70}
              className="w-48 rounded-[8px] border border-[#1f1f1f] bg-transparent px-3 py-2 font-mono text-[14px] text-[#f8f9fa] focus:border-[#7C5CFC] focus:outline-none"
            />
          </label>
          <button
            type="submit"
            className="rounded-full border border-[#7C5CFC] bg-[#7C5CFC]/15 px-5 py-2 font-manrope text-[13px] font-medium text-[#a48dff] hover:bg-[#7C5CFC]/25"
          >
            Save
          </button>
          {settings?.updated_at && (
            <span className="ml-auto font-manrope text-[11px] text-[#535357]">
              Last updated {formatDate(settings.updated_at)}
            </span>
          )}
        </form>
        <p className="mt-3 font-manrope text-[11px] text-[#535357]">
          Distribution day is informational — trigger is manual.  At payout time we use the pool value above, even if it changed mid-week.  Trajectory threshold controls which attempts get their full frame log archived in Supabase Storage (lower = keep more, higher = keep only the best).
        </p>
      </section>

      {/* ─── Pending weeks ───────────────────────────────────────────── */}
      <section className="mb-10">
        <h2 className="mb-4 font-manrope text-[16px] font-semibold text-[#f8f9fa]">
          Pending weeks <span className="text-[#737780]">({pending.length})</span>
        </h2>
        {pending.length === 0 ? (
          <div className="rounded-[12px] border border-dashed border-[#1f1f1f] py-10 text-center font-manrope text-[13px] text-[#737780]">
            All completed weeks are already paid out.
          </div>
        ) : (
          <div className="overflow-hidden rounded-[12px] border border-[#1f1f1f]">
            <table className="w-full text-left">
              <thead className="bg-[rgba(248,249,250,0.03)]">
                <tr>
                  <Th>Week</Th>
                  <Th>Participants</Th>
                  <Th>Total score</Th>
                  <Th>Pool to distribute</Th>
                  <Th>—</Th>
                </tr>
              </thead>
              <tbody>
                {pending.map((w) => (
                  <tr key={w.week_start} className="border-t border-[#1a1a1a]">
                    <Td>
                      <span className="font-mono text-[12px] text-[#f8f9fa]">
                        {formatDate(w.week_start)} – {formatDate(w.week_end)}
                      </span>
                    </Td>
                    <Td>
                      <span className="font-mono text-[13px] text-[#f8f9fa]">
                        {w.participant_count}
                      </span>
                    </Td>
                    <Td>
                      <span className="font-mono text-[13px] text-[#a8a8b0]">
                        {Number(w.total_score).toFixed(1)}
                      </span>
                    </Td>
                    <Td>
                      <span className="font-mono text-[13px] text-[#a48dff]">
                        {(settings?.weekly_pool_xp ?? 0).toLocaleString()} XP
                      </span>
                    </Td>
                    <Td>
                      <form action={distributeWeek}>
                        <input type="hidden" name="week_start" value={w.week_start} />
                        <button
                          type="submit"
                          disabled={w.participant_count === 0}
                          className="rounded-full border border-[#7C5CFC] bg-[#7C5CFC]/15 px-4 py-1.5 font-manrope text-[12px] font-medium text-[#a48dff] hover:bg-[#7C5CFC]/25 disabled:opacity-40"
                          title={w.participant_count === 0 ? 'No participants — pool forfeits' : 'Distribute now'}
                        >
                          {w.participant_count === 0 ? 'Forfeit empty week' : 'Distribute now'}
                        </button>
                      </form>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ─── History ─────────────────────────────────────────────────── */}
      <section>
        <h2 className="mb-4 font-manrope text-[16px] font-semibold text-[#f8f9fa]">
          Distribution history <span className="text-[#737780]">({history.length})</span>
        </h2>
        {history.length === 0 ? (
          <div className="rounded-[12px] border border-dashed border-[#1f1f1f] py-10 text-center font-manrope text-[13px] text-[#737780]">
            No distributions yet.
          </div>
        ) : (
          <div className="overflow-hidden rounded-[12px] border border-[#1f1f1f]">
            <table className="w-full text-left">
              <thead className="bg-[rgba(248,249,250,0.03)]">
                <tr>
                  <Th>Week</Th>
                  <Th>Paid out at</Th>
                  <Th>By</Th>
                  <Th>Pool</Th>
                  <Th>Participants</Th>
                  <Th>Total score</Th>
                  <Th>—</Th>
                </tr>
              </thead>
              <tbody>
                {history.map((d) => (
                  <tr key={d.id} className="border-t border-[#1a1a1a]">
                    <Td>
                      <span className="font-mono text-[12px] text-[#f8f9fa]">
                        {formatDate(d.week_start)} – {formatDate(d.week_end)}
                      </span>
                    </Td>
                    <Td>
                      <div className="flex flex-col">
                        <span className="font-mono text-[11px] text-[#a8a8b0]">{formatDate(d.distributed_at)}</span>
                        <span className="font-mono text-[10px] text-[#737780]">{formatTime(d.distributed_at)}</span>
                      </div>
                    </Td>
                    <Td>
                      <span className="font-manrope text-[12px] text-[#a8a8b0]">
                        {d.distributor_email ?? '—'}
                      </span>
                    </Td>
                    <Td>
                      <span className="font-mono text-[13px] text-[#a48dff]">
                        {d.pool_xp.toLocaleString()} XP
                      </span>
                    </Td>
                    <Td>
                      <span className="font-mono text-[13px] text-[#f8f9fa]">
                        {d.participant_count}
                      </span>
                    </Td>
                    <Td>
                      <span className="font-mono text-[13px] text-[#a8a8b0]">
                        {Number(d.total_score).toFixed(1)}
                      </span>
                    </Td>
                    <Td>
                      <Link
                        href={`/admin/xp/${d.id}`}
                        className="font-manrope text-[12px] text-[#a48dff] hover:underline"
                      >
                        Awards →
                      </Link>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
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
  return <td className="px-4 py-3 align-middle">{children}</td>;
}

function Toast({ tone, message }: { tone: 'ok' | 'err'; message: string }) {
  const c = tone === 'ok'
    ? 'border-emerald-700 bg-emerald-900/20 text-emerald-300'
    : 'border-red-700 bg-red-900/20 text-red-300';
  return <div className={`mb-4 rounded-[6px] border px-3 py-2 text-[12px] ${c}`}>{message}</div>;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric', timeZone: 'UTC' });
}
function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' });
}
