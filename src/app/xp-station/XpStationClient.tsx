'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bot, ChevronDown, Search } from 'lucide-react';
import type { HistoryRowDB, LeaderRowDB } from './page';

type TabKey = 'leaderboard' | 'history';

type Grade = 'S' | 'A' | 'B' | 'C' | '—';

interface UserSummary {
  user_id: string;
  total_xp: number;
  weekly_xp: number;
  avg_score: number;
  grade: Grade;
  rank: number | null;
  attempts_count: number;
  successes: number;
}

interface Props {
  signedIn: boolean;
  summary: UserSummary | null;
  history: HistoryRowDB[];
  leaders: LeaderRowDB[];
  currentUserId: string | null;
}

export default function XpStationClient({ signedIn, summary, history, leaders, currentUserId }: Props) {
  const [tab, setTab] = useState<TabKey>('leaderboard');

  // Countdown to the next Monday 00:00 UTC — recomputes the target if the
  // user keeps the page open past midnight (instead of stalling at 0/0/0/0).
  const [target, setTarget] = useState<Date>(() => nextMondayUtc());
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= target.getTime()) setTarget(nextMondayUtc());
    }, 1000);
    return () => clearInterval(id);
  }, [target]);
  const remaining = diffParts(target.getTime(), now);

  const avgScore = summary?.avg_score ? Number(summary.avg_score) : 0;
  const grade: Grade = summary?.grade ?? '—';
  const totalXp = summary?.total_xp ?? 0;
  const weeklyXp = summary?.weekly_xp ?? 0;
  const attempts = summary?.attempts_count ?? 0;
  const successes = summary?.successes ?? 0;
  const successRate = attempts > 0 ? Math.round((successes / attempts) * 100) : 0;
  const rank = summary?.rank ?? null;

  return (
    <div className="relative mx-auto flex max-w-[1280px] flex-col px-[24px] pb-[80px] pt-[80px]">
      {/* ─── Hero: title + countdown ─────────────────────────────────── */}
      <div className="flex flex-col items-center gap-[32px] pb-[80px]">
        <h1 className="font-manrope text-[48px] font-semibold leading-[58px] text-[#f8f9fa]">
          XP Station
        </h1>
        <div className="flex items-center gap-[6px] rounded-[12px] border border-[rgba(255,255,255,0.04)] bg-[rgba(255,255,255,0.02)] px-[24px] py-[12px]">
          <TimeSegment value={remaining.d} label="Days"    dim />
          <Separator />
          <TimeSegment value={remaining.h} label="Hours"   dim />
          <Separator />
          <TimeSegment value={remaining.m} label="Minutes" dim />
          <Separator />
          <TimeSegment value={remaining.s} label="Seconds" />
        </div>
        <p className="font-manrope text-[12px] text-[#737780]">
          Next week boundary (Monday 00:00 UTC) — admin distributes the pool any time after.
        </p>
      </div>

      {/* ─── My Activity ─────────────────────────────────────────────── */}
      <section className="flex flex-col gap-[24px]">
        <h2 className="font-manrope text-[24px] font-semibold text-[#f8f9fa]">My Activity</h2>
        <div className="grid grid-cols-[324px_1fr_1fr] gap-[24px]">
          <ActivityCard>
            <div className="flex h-full items-center justify-center">
              <Donut score={Math.round(avgScore)} max={100} grade={grade} />
            </div>
          </ActivityCard>
          <ActivityCard>
            <MetricRow label="Avg Score" value={`${Math.round(avgScore)}/100`} />
            <Divider />
            <MetricRow label="Success Rate" value={`${successRate}%`} />
            <Divider />
            <MetricRow label="Rank" value={rank && rank > 0 ? `${rank}` : '—'} />
          </ActivityCard>
          <ActivityCard>
            <MetricRow label="Total XP"  value={`${totalXp.toLocaleString()} XP`} />
            <Divider />
            <MetricRow label="Last Weekly XP" value={`${weeklyXp.toLocaleString()} XP`} />
            <Divider />
            <MetricRow label="Attempts" value={`${attempts}`} />
          </ActivityCard>
        </div>
        {!signedIn && (
          <p className="font-manrope text-[12px] text-[#737780]">
            <Link href="/login" className="text-[#a48dff] hover:underline">Sign in</Link> to track your missions and XP.
          </p>
        )}
      </section>

      {/* ─── Tabs ────────────────────────────────────────────────────── */}
      <div className="mt-[80px] flex w-full max-w-[664px] items-end">
        <TabButton active={tab === 'leaderboard'} onClick={() => setTab('leaderboard')}>
          Leaderboard
        </TabButton>
        <TabButton active={tab === 'history'} onClick={() => setTab('history')}>
          Mission History
        </TabButton>
      </div>

      <div className="mt-[16px]">
        {tab === 'leaderboard'
          ? <LeaderboardTable rows={leaders} currentUserId={currentUserId} />
          : <HistoryTable rows={history} signedIn={signedIn} />}
      </div>
    </div>
  );
}

// ─── Countdown ───────────────────────────────────────────────────────────

function nextMondayUtc(): Date {
  const now = new Date();
  const d = now.getUTCDay();          // 0=Sun .. 6=Sat
  // Days until next Monday (1).  If today IS Monday, point to next Monday (7 days).
  const daysUntil = ((1 - d + 7) % 7) || 7;
  return new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysUntil,
    0, 0, 0, 0,
  ));
}

interface Remaining { d: number; h: number; m: number; s: number; }
function diffParts(targetMs: number, nowMs: number): Remaining {
  const ms = Math.max(0, targetMs - nowMs);
  const s = Math.floor(ms / 1000);
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

function pad(n: number) { return String(n).padStart(2, '0'); }

function TimeSegment({ value, label, dim = false }: { value: number; label: string; dim?: boolean }) {
  return (
    <div className="flex w-[72px] flex-col items-center whitespace-nowrap">
      <p className={`font-manrope text-[48px] font-semibold leading-none ${dim ? 'text-[#7b7b80]' : 'text-[#f8f9fa]'}`}>
        {pad(value)}
      </p>
      <p className={`mt-[6px] font-manrope text-[14px] uppercase tracking-wide ${dim ? 'text-[#494a4d]' : 'text-[#f8f9fa]'}`}>
        {label}
      </p>
    </div>
  );
}

function Separator() {
  return (
    <div className="flex h-[30px] w-[4px] flex-col justify-center gap-[6px]">
      <span className="size-[4px] rounded-full bg-[#494a4d]" />
      <span className="size-[4px] rounded-full bg-[#494a4d]" />
    </div>
  );
}

// ─── Activity card / metrics ─────────────────────────────────────────────

function ActivityCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-[12px] border border-[#757685] p-[32px] backdrop-blur-[10px]"
      style={{ backgroundImage: 'linear-gradient(134deg, rgba(117,118,133,0.18) 0%, rgba(4,4,4,0.5) 65%)' }}
    >
      <div className="flex h-full flex-col justify-between gap-[16px]">{children}</div>
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-[8px]">
      <span className="font-manrope text-[14px] leading-[20px] text-[#939399]">{label}</span>
      <span className="font-manrope text-[28px] font-semibold leading-[38px] text-[#f8f9fa]">{value}</span>
    </div>
  );
}

function Divider() {
  return <div className="h-px w-full bg-[#2b2d33]" />;
}

// ─── Donut (SVG, grade-driven center) ────────────────────────────────────

const GRADE_COLOR: Record<Grade, string> = {
  S: '#70fbdb',
  A: '#3676f8',
  B: '#facc15',
  C: '#7a7b80',
  '—': '#535357',
};

function Donut({ score, max, grade }: { score: number; max: number; grade: Grade }) {
  const size = 240, stroke = 24;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, score / max));
  const dash = c * pct;
  const color = GRADE_COLOR[grade];
  return (
    <div className="relative size-[240px]">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="rotate-[-90deg]">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-[8px]">
        <span
          className="font-manrope text-[72px] font-bold leading-none tracking-[-2.16px] text-[#f8f9fa]"
          style={{ textShadow: `0 0 12px ${color}50` }}
        >
          {grade}
        </span>
        <span className="rounded-full bg-[rgba(255,255,255,0.04)] px-[8px] py-[4px] font-manrope text-[14px] font-medium tracking-[-0.42px]">
          <span className="text-[#f8f9fa]">{score}</span>
          <span className="text-[rgba(248,249,250,0.3)]">/{max}</span>
        </span>
      </div>
    </div>
  );
}

// ─── Tabs ────────────────────────────────────────────────────────────────

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="flex flex-col items-start gap-[10px] px-[6px] py-[10px]">
      <span className={`font-manrope text-[20px] font-medium leading-[1.6] xl:text-[24px] ${active ? 'text-[#f8f9fa]' : 'text-[#535357] hover:text-[#a8a8b0]'}`}>
        {children}
      </span>
      <span className={`h-px w-full bg-[#f8f9fa] ${active ? '' : 'opacity-0'}`} />
    </button>
  );
}

// ─── Leaderboard ─────────────────────────────────────────────────────────

const GRADE_CHIP: Record<'S' | 'A' | 'B' | 'C', string> = {
  S: 'bg-[rgba(112,251,219,0.15)] text-[#70fbdb]',
  A: 'bg-[rgba(54,118,248,0.15)] text-[#3676f8]',
  B: 'bg-[rgba(250,204,21,0.15)] text-[#facc15]',
  C: 'bg-[rgba(122,123,128,0.18)] text-[#a8a8b0]',
};

function LeaderboardTable({ rows, currentUserId }: { rows: LeaderRowDB[]; currentUserId: string | null }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-[16px] border border-dashed border-[#1f1f1f] py-12 text-center font-manrope text-[13px] text-[#737780]">
        No XP has been distributed yet.  Play some missions; the leaderboard fills after the first weekly payout.
      </div>
    );
  }
  return (
    <div className="w-full">
      <div
        className="grid h-[46px] grid-cols-[100px_1fr_180px_180px_140px_140px] items-center"
        style={{ backgroundImage: 'linear-gradient(to right, #07070a 0%, #0e0e0f 50%, #07070a 100%)' }}
      >
        <HeaderCell>Rank</HeaderCell>
        <HeaderCell>User</HeaderCell>
        <HeaderCell>Total XP</HeaderCell>
        <HeaderCell>Attempts</HeaderCell>
        <HeaderCell>Avg Score</HeaderCell>
        <HeaderCell>Grade</HeaderCell>
      </div>
      <div>
        {rows.map((row) => {
          const isYou = row.user_id === currentUserId;
          return (
            <div
              key={row.user_id}
              className={[
                'grid h-[64px] grid-cols-[100px_1fr_180px_180px_140px_140px] items-center border-b border-[#1a1a1a]',
                isYou ? 'bg-[rgba(124,92,252,0.06)]' : '',
              ].join(' ')}
            >
              <Cell>
                {row.rank <= 3 ? (
                  <span className="font-manrope text-[24px] font-bold leading-none text-[#f8f9fa]">
                    {pad(row.rank)}
                  </span>
                ) : (
                  <span className="font-manrope text-[14px] font-medium leading-[1.4] text-[#7a7b80]">
                    {row.rank}
                  </span>
                )}
              </Cell>
              <Cell>
                <div className="flex items-center gap-[10px]">
                  <Avatar seed={row.rank} />
                  <span className="font-manrope text-[12px] font-medium text-[#7a7b80]">
                    {maskEmail(row.user_email)}
                    {isYou ? ' (you)' : ''}
                  </span>
                </div>
              </Cell>
              <Cell muted>{row.total_xp.toLocaleString()}</Cell>
              <Cell muted>{row.attempts}</Cell>
              <Cell>
                <span className="font-manrope text-[12px] font-medium">
                  <span className="text-[#f8f9fa]">{Math.round(Number(row.avg_score))}</span>
                  <span className="text-[#7a7b80]">/100</span>
                </span>
              </Cell>
              <Cell>
                <span className={`inline-flex rounded-[6px] px-[6px] py-[4px] font-manrope text-[12px] font-semibold ${GRADE_CHIP[row.grade]}`}>
                  {row.grade}
                </span>
              </Cell>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function maskEmail(email: string | null): string {
  if (!email) return '(deleted)';
  const at = email.indexOf('@');
  if (at < 2) return email;
  return email.slice(0, 2) + '…' + email.slice(at);
}

function HeaderCell({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-[20px] py-[16px] font-manrope text-[12px] font-medium leading-[1.2] text-[#7a7b80]">
      {children}
    </span>
  );
}

function Cell({ children, muted = false }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <div className={`flex items-center px-[20px] py-[16px] ${muted ? 'font-manrope text-[12px] font-medium text-[#7a7b80]' : ''}`}>
      {children}
    </div>
  );
}

function Avatar({ seed }: { seed: number }) {
  const hueA = (seed * 47) % 360;
  const hueB = (hueA + 80) % 360;
  return (
    <div
      className="size-[32px] rounded-full"
      style={{ backgroundImage: `linear-gradient(135deg, hsl(${hueA} 70% 60%), hsl(${hueB} 70% 35%))` }}
      aria-hidden="true"
    />
  );
}

// ─── Mission History (the signed-in user's own attempts) ────────────────

function HistoryTable({ rows, signedIn }: { rows: HistoryRowDB[]; signedIn: boolean }) {
  if (!signedIn) {
    return (
      <div className="rounded-[16px] border border-dashed border-[#1f1f1f] py-12 text-center font-manrope text-[13px] text-[#737780]">
        <Link href="/login" className="text-[#a48dff] hover:underline">Sign in</Link> to see your mission history.
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="rounded-[16px] border border-dashed border-[#1f1f1f] py-12 text-center font-manrope text-[13px] text-[#737780]">
        You haven&apos;t played any missions yet.  Head to{' '}
        <Link href="/missions" className="text-[#a48dff] hover:underline">/missions</Link>.
      </div>
    );
  }
  return (
    <div className="w-full">
      <div
        className="grid h-[46px] grid-cols-[120px_1fr_120px_120px_140px_140px_100px] items-center"
        style={{ backgroundImage: 'linear-gradient(to right, #07070a 0%, #0e0e0f 50%, #07070a 100%)' }}
      >
        <HeaderCell>Date</HeaderCell>
        <HeaderCell>Mission</HeaderCell>
        <HeaderCell>Difficulty</HeaderCell>
        <HeaderCell>Status</HeaderCell>
        <HeaderCell>Score</HeaderCell>
        <HeaderCell>Stars</HeaderCell>
        <HeaderCell>XP</HeaderCell>
      </div>
      <div>
        {rows.map((row) => (
          <div key={row.id} className="grid h-[64px] grid-cols-[120px_1fr_120px_120px_140px_140px_100px] items-center border-b border-[#1a1a1a]">
            <Cell>
              <div className="flex flex-col">
                <span className="font-mono text-[11px] text-[#f8f9fa]">{formatDate(row.started_at)}</span>
                <span className="font-mono text-[10px] text-[#737780]">{formatTime(row.started_at)}</span>
              </div>
            </Cell>
            <Cell>
              <span className="font-manrope text-[14px] text-[#f8f9fa]">{row.mission_title}</span>
            </Cell>
            <Cell>
              <DifficultyChip value={row.mission_difficulty} />
            </Cell>
            <Cell>
              <StatusChip value={row.status} />
            </Cell>
            <Cell>
              <span className="font-manrope text-[12px] font-medium">
                <span className="text-[#f8f9fa]">{row.quality_score ?? '—'}</span>
                <span className="text-[#7a7b80]">{row.quality_score !== null ? '/100' : ''}</span>
              </span>
            </Cell>
            <Cell>
              <Stars n={row.stars ?? 0} />
            </Cell>
            <Cell>
              <span className="font-mono text-[12px] text-[#a48dff]">
                {row.xp_awarded !== null ? `+${row.xp_awarded}` : 'Pending'}
              </span>
            </Cell>
          </div>
        ))}
      </div>
    </div>
  );
}

function DifficultyChip({ value }: { value: HistoryRowDB['mission_difficulty'] }) {
  const palette: Record<HistoryRowDB['mission_difficulty'], string> = {
    easy:   'bg-[rgba(174,255,24,0.15)] text-[#aeff18]',
    medium: 'bg-[rgba(54,118,248,0.15)] text-[#3676f8]',
    hard:   'bg-[rgba(239,75,220,0.15)] text-[#ef4bdc]',
    expert: 'bg-[rgba(239,68,68,0.18)] text-[#ef4444]',
  };
  return (
    <span className={`inline-flex rounded-[6px] px-[8px] py-[4px] font-manrope text-[12px] font-medium capitalize ${palette[value]}`}>
      {value}
    </span>
  );
}

function StatusChip({ value }: { value: HistoryRowDB['status'] }) {
  const palette: Record<HistoryRowDB['status'], { dot: string; text: string }> = {
    running:   { dot: 'bg-[#737780]', text: 'text-[#a8a8b0]' },
    success:   { dot: 'bg-[#22c55e]', text: 'text-[#22c55e]' },
    failed:    { dot: 'bg-[#ef4444]', text: 'text-[#ef4444]' },
    timeout:   { dot: 'bg-[#facc15]', text: 'text-[#facc15]' },
    abandoned: { dot: 'bg-[#737780]', text: 'text-[#a8a8b0]' },
  };
  const c = palette[value];
  return (
    <span className="inline-flex items-center gap-[6px]">
      <span className={`size-[6px] rounded-full ${c.dot}`} />
      <span className={`font-manrope text-[12px] font-medium capitalize ${c.text}`}>{value}</span>
    </span>
  );
}

function Stars({ n }: { n: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3].map((i) => (
        <svg
          key={i}
          width="12" height="12" viewBox="0 0 24 24"
          fill={i <= n ? '#FACC15' : 'none'}
          stroke={i <= n ? '#FACC15' : '#2a2a35'}
          strokeWidth="2"
          className="inline-block"
        >
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ))}
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', timeZone: 'UTC' });
}
function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' });
}
