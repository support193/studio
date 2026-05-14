// XP Station — Figma "XP Station" (4:144300, Leaderboard view + 4:143818, Mission History view).
// Frontend-only: countdown, donut chart, metric cards, and two stub tables.
// All data is dummy until the back-end is wired up.

'use client';

import { useEffect, useMemo, useState } from 'react';

type TabKey = 'leaderboard' | 'history';

// ─── Dummy data ───────────────────────────────────────────────────────────

interface LeaderRow {
  rank: number;
  address: string;
  isYou?: boolean;
  xp: number;
  attempts: number;
  score: number;
  scoreMax: number;
  grade: string;
}

const LEADERS: LeaderRow[] = [
  { rank: 1, address: '0x15cb…4Cdc', xp: 20, attempts: 56, score: 64, scoreMax: 100, grade: 'S' },
  { rank: 2, address: '0x42a8…91Ee', xp: 20, attempts: 56, score: 64, scoreMax: 100, grade: 'S' },
  { rank: 3, address: '0x9f02…7B33', xp: 20, attempts: 56, score: 64, scoreMax: 100, grade: 'S' },
  { rank: 4, address: '0x1c30…dD11', xp: 20, attempts: 56, score: 64, scoreMax: 100, grade: 'S' },
  { rank: 5, address: '0x88af…2A0C', xp: 20, attempts: 56, score: 64, scoreMax: 100, grade: 'S' },
  { rank: 6, address: '0x4bd1…5F87', xp: 20, attempts: 56, score: 64, scoreMax: 100, grade: 'S' },
  { rank: 7, address: '0xa7e9…0212', xp: 20, attempts: 56, score: 64, scoreMax: 100, grade: 'S' },
  { rank: 8, address: '0x6011…ccA4', xp: 20, attempts: 56, score: 64, scoreMax: 100, grade: 'S' },
  { rank: 9, address: '0x2dd4…71Bf', xp: 20, attempts: 56, score: 64, scoreMax: 100, grade: 'S' },
  { rank: 152, address: '0x15cb…4Cdc', isYou: true, xp: 1583, attempts: 56, score: 64, scoreMax: 100, grade: 'S' },
];

interface HistoryRow {
  date: string;
  mission: string;
  difficulty: 'Easy' | 'Normal' | 'Hard';
  attempts: number;
  score: number;
  scoreMax: number;
  status: 'Completed' | 'Failed' | 'Timeout';
  xp: number;
}

const HISTORY: HistoryRow[] = [
  { date: 'Apr 10', mission: 'Place the Cubes',  difficulty: 'Easy',   attempts: 2, score: 91, scoreMax: 100, status: 'Completed', xp: 1200 },
  { date: 'Apr 10', mission: 'Place the Cubes',  difficulty: 'Normal', attempts: 3, score: 78, scoreMax: 100, status: 'Completed', xp: 1200 },
  { date: 'Apr 09', mission: 'Stack Two Cubes',  difficulty: 'Normal', attempts: 1, score: 88, scoreMax: 100, status: 'Completed', xp: 1200 },
  { date: 'Apr 09', mission: 'Sort by Color',    difficulty: 'Hard',   attempts: 5, score: 0,  scoreMax: 100, status: 'Failed',    xp: 0    },
  { date: 'Apr 08', mission: 'Hold and Lift',    difficulty: 'Easy',   attempts: 1, score: 95, scoreMax: 100, status: 'Completed', xp: 1200 },
  { date: 'Apr 08', mission: 'Push the Puck',    difficulty: 'Normal', attempts: 4, score: 0,  scoreMax: 100, status: 'Timeout',   xp: 0    },
  { date: 'Apr 07', mission: 'Reach the Target', difficulty: 'Easy',   attempts: 1, score: 99, scoreMax: 100, status: 'Completed', xp: 1200 },
  { date: 'Apr 07', mission: 'Stack Two Cubes',  difficulty: 'Normal', attempts: 2, score: 71, scoreMax: 100, status: 'Completed', xp: 1200 },
  { date: 'Apr 06', mission: 'Sort by Color',    difficulty: 'Hard',   attempts: 3, score: 82, scoreMax: 100, status: 'Completed', xp: 1200 },
  { date: 'Apr 05', mission: 'Place the Cubes',  difficulty: 'Easy',   attempts: 1, score: 100,scoreMax: 100, status: 'Completed', xp: 1200 },
];

// Countdown target: next Sunday 00:00 UTC.  Recomputed once on mount.
function nextEventDate(): Date {
  const now = new Date();
  const day = now.getUTCDay();
  const daysUntilSunday = (7 - day) % 7 || 7;
  const target = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysUntilSunday,
    0, 0, 0, 0,
  ));
  return target;
}

interface Remaining { d: number; h: number; m: number; s: number; }

function diffParts(targetMs: number, nowMs: number): Remaining {
  const ms = Math.max(0, targetMs - nowMs);
  const s = Math.floor(ms / 1000);
  return {
    d: Math.floor(s / 86400),
    h: Math.floor((s % 86400) / 3600),
    m: Math.floor((s % 3600) / 60),
    s: s % 60,
  };
}

// ─── Page ─────────────────────────────────────────────────────────────────

export default function XpStationPage() {
  const [tab, setTab] = useState<TabKey>('leaderboard');
  const target = useMemo(() => nextEventDate(), []);
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const remaining = diffParts(target.getTime(), now);

  return (
    <div className="relative min-h-[calc(100vh-52px)] w-full overflow-hidden bg-[#030303]">
      {/* Hero background glow — soft white plume from top-left fading to black. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[1050px]"
        style={{
          background:
            'radial-gradient(60% 50% at 30% 18%, rgba(255,255,255,0.10), transparent 70%), radial-gradient(50% 40% at 75% 25%, rgba(124,92,252,0.08), transparent 70%)',
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-[400px] h-[650px]"
        style={{
          background: 'linear-gradient(to bottom, rgba(3,3,3,0) 0%, #030303 100%)',
        }}
      />

      <div className="relative mx-auto flex max-w-[1280px] flex-col px-[24px] pb-[80px] pt-[80px]">
        {/* ─── Hero: title + countdown ─────────────────────────────────── */}
        <div className="flex flex-col items-center gap-[32px] pb-[80px]">
          <h1 className="font-manrope text-[48px] font-semibold leading-[58px] text-[#f8f9fa]">
            XP Station
          </h1>
          <div className="flex items-center gap-[6px] rounded-[12px] border border-[rgba(255,255,255,0.04)] bg-[rgba(255,255,255,0.02)] px-[24px] py-[12px]">
            <TimeSegment value={remaining.d} label="Days"   dim />
            <Separator />
            <TimeSegment value={remaining.h} label="Hours"  dim />
            <Separator />
            <TimeSegment value={remaining.m} label="Minutes" dim />
            <Separator />
            <TimeSegment value={remaining.s} label="Seconds" />
          </div>
        </div>

        {/* ─── My Activity ─────────────────────────────────────────────── */}
        <section className="flex flex-col gap-[24px]">
          <h2 className="font-manrope text-[24px] font-semibold text-[#f8f9fa]">My Activity</h2>
          <div className="grid grid-cols-[324px_1fr_1fr] gap-[24px]">
            <ActivityCard>
              <div className="flex h-full items-center justify-center">
                <Donut score={64} max={100} />
              </div>
            </ActivityCard>
            <ActivityCard>
              <MetricRow label="Score"       value="64/100" />
              <Divider />
              <MetricRow label="Performance" value="3%" />
              <Divider />
              <MetricRow label="Rank"        value="152" />
            </ActivityCard>
            <ActivityCard>
              <MetricRow label="Total XP"  value="1,854 XP" />
              <Divider />
              <MetricRow label="Weekly XP" value="25 XP" />
              <Divider />
              <MetricRow label="Attempts"  value="43" />
            </ActivityCard>
          </div>
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

        {/* ─── Active panel ────────────────────────────────────────────── */}
        <div className="mt-[16px]">
          {tab === 'leaderboard' ? <LeaderboardTable /> : <HistoryTable />}
        </div>
      </div>
    </div>
  );
}

// ─── Countdown pieces ─────────────────────────────────────────────────────

function pad(n: number) {
  return String(n).padStart(2, '0');
}

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

// ─── Activity card / metrics ──────────────────────────────────────────────

function ActivityCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-[12px] border border-[#757685] p-[32px] backdrop-blur-[10px]"
      style={{
        backgroundImage:
          'linear-gradient(134deg, rgba(117,118,133,0.18) 0%, rgba(4,4,4,0.5) 65%)',
      }}
    >
      <div className="flex h-full flex-col justify-between gap-[16px]">
        {children}
      </div>
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-[8px]">
      <span className="font-manrope text-[14px] leading-[20px] text-[#939399]">{label}</span>
      <span className="font-manrope text-[28px] font-semibold leading-[38px] text-[#f8f9fa]">
        {value}
      </span>
    </div>
  );
}

function Divider() {
  return <div className="h-px w-full bg-[#2b2d33]" />;
}

// ─── Donut (SVG, score-driven) ────────────────────────────────────────────

function Donut({ score, max }: { score: number; max: number }) {
  // Geometry: 240×240 outer, stroke 24, leaving ~ 192px inner — matches Figma proportions.
  const size = 240;
  const stroke = 24;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, score / max));
  const dash = c * pct;
  return (
    <div className="relative size-[240px]">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="rotate-[-90deg]">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#3676f8"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
        />
      </svg>
      {/* Center letter + chip */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-[8px]">
        <span
          className="font-manrope text-[72px] font-bold leading-none tracking-[-2.16px] text-[#f8f9fa]"
          style={{ textShadow: '0 0 10px rgba(255,255,255,0.2)' }}
        >
          S
        </span>
        <span className="rounded-full bg-[rgba(255,255,255,0.04)] px-[8px] py-[4px] font-manrope text-[14px] font-medium tracking-[-0.42px]">
          <span className="text-[#f8f9fa]">{score}</span>
          <span className="text-[rgba(248,249,250,0.3)]">/{max}</span>
        </span>
      </div>
    </div>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────

function TabButton({
  active, onClick, children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-start gap-[10px] px-[6px] py-[10px]"
    >
      <span
        className={`font-manrope text-[20px] font-medium leading-[1.6] xl:text-[24px] ${
          active ? 'text-[#f8f9fa]' : 'text-[#535357] hover:text-[#a8a8b0]'
        }`}
      >
        {children}
      </span>
      <span className={`h-px w-full bg-[#f8f9fa] ${active ? '' : 'opacity-0'}`} />
    </button>
  );
}

// ─── Leaderboard table ───────────────────────────────────────────────────

function LeaderboardTable() {
  return (
    <div className="w-full">
      <div
        className="grid h-[46px] grid-cols-[140px_1fr_200px_200px_160px_160px] items-center"
        style={{
          backgroundImage:
            'linear-gradient(to right, #07070a 0%, #0e0e0f 50%, #07070a 100%)',
        }}
      >
        <HeaderCell>Rank</HeaderCell>
        <HeaderCell>Address</HeaderCell>
        <HeaderCell>XP</HeaderCell>
        <HeaderCell>Attempts</HeaderCell>
        <HeaderCell>Score</HeaderCell>
        <HeaderCell>Grade</HeaderCell>
      </div>
      <div>
        {LEADERS.map((row) => (
          <div
            key={row.rank}
            className="grid h-[64px] grid-cols-[140px_1fr_200px_200px_160px_160px] items-center border-b border-[#1a1a1a]"
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
                  {row.address}
                  {row.isYou ? ' (you)' : ''}
                </span>
              </div>
            </Cell>
            <Cell muted>{row.xp.toLocaleString()}</Cell>
            <Cell muted>{row.attempts}</Cell>
            <Cell>
              <span className="font-manrope text-[12px] font-medium">
                <span className="text-[#f8f9fa]">{row.score}</span>
                <span className="text-[#7a7b80]">/{row.scoreMax}</span>
              </span>
            </Cell>
            <Cell>
              <span className="inline-flex rounded-[6px] bg-[rgba(112,251,219,0.15)] px-[6px] py-[4px] font-manrope text-[12px] font-semibold text-[#70fbdb]">
                {row.grade}
              </span>
            </Cell>
          </div>
        ))}
      </div>
    </div>
  );
}

function HeaderCell({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-[24px] py-[16px] font-manrope text-[12px] font-medium leading-[1.2] text-[#7a7b80]">
      {children}
    </span>
  );
}

function Cell({ children, muted = false }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <div
      className={`flex items-center px-[24px] py-[16px] ${
        muted ? 'font-manrope text-[12px] font-medium text-[#7a7b80]' : ''
      }`}
    >
      {children}
    </div>
  );
}

// Procedural avatar — deterministic gradient + initial based on the seed.
function Avatar({ seed }: { seed: number }) {
  const hueA = (seed * 47) % 360;
  const hueB = (hueA + 80) % 360;
  return (
    <div
      className="flex size-[32px] items-center justify-center rounded-full"
      style={{
        backgroundImage: `linear-gradient(135deg, hsl(${hueA} 70% 60%), hsl(${hueB} 70% 35%))`,
      }}
      aria-hidden="true"
    />
  );
}

// ─── Mission History table ───────────────────────────────────────────────

function HistoryTable() {
  return (
    <div className="w-full">
      <div
        className="grid h-[46px] grid-cols-[100px_1fr_140px_120px_140px_160px_120px] items-center"
        style={{
          backgroundImage:
            'linear-gradient(to right, #07070a 0%, #0e0e0f 50%, #07070a 100%)',
        }}
      >
        <HeaderCell>Date</HeaderCell>
        <HeaderCell>Mission</HeaderCell>
        <HeaderCell>Difficulty</HeaderCell>
        <HeaderCell>Attempts</HeaderCell>
        <HeaderCell>Score</HeaderCell>
        <HeaderCell>Status</HeaderCell>
        <HeaderCell>XP</HeaderCell>
      </div>
      <div>
        {HISTORY.map((row, i) => (
          <div
            key={i}
            className="grid h-[64px] grid-cols-[100px_1fr_140px_120px_140px_160px_120px] items-center border-b border-[#1a1a1a]"
          >
            <Cell muted>{row.date}</Cell>
            <Cell>
              <span className="font-manrope text-[14px] font-medium text-[#f8f9fa]">
                {row.mission}
              </span>
            </Cell>
            <Cell>
              <DifficultyChip value={row.difficulty} />
            </Cell>
            <Cell muted>{row.attempts}</Cell>
            <Cell>
              <span className="font-manrope text-[12px] font-medium">
                <span className="text-[#f8f9fa]">{row.score}</span>
                <span className="text-[#7a7b80]">/{row.scoreMax}</span>
              </span>
            </Cell>
            <Cell>
              <StatusChip value={row.status} />
            </Cell>
            <Cell muted>
              {row.xp > 0 ? `+${row.xp.toLocaleString()}` : '—'}
            </Cell>
          </div>
        ))}
      </div>
    </div>
  );
}

function DifficultyChip({ value }: { value: HistoryRow['difficulty'] }) {
  const palette: Record<HistoryRow['difficulty'], string> = {
    Easy:   'bg-[rgba(174,255,24,0.15)] text-[#aeff18]',
    Normal: 'bg-[rgba(54,118,248,0.15)] text-[#3676f8]',
    Hard:   'bg-[rgba(239,75,220,0.15)] text-[#ef4bdc]',
  };
  return (
    <span className={`inline-flex rounded-[6px] px-[8px] py-[4px] font-manrope text-[12px] font-medium ${palette[value]}`}>
      {value}
    </span>
  );
}

function StatusChip({ value }: { value: HistoryRow['status'] }) {
  const palette: Record<HistoryRow['status'], { dot: string; text: string }> = {
    Completed: { dot: 'bg-[#22c55e]', text: 'text-[#22c55e]' },
    Failed:    { dot: 'bg-[#ef4444]', text: 'text-[#ef4444]' },
    Timeout:   { dot: 'bg-[#facc15]', text: 'text-[#facc15]' },
  };
  const { dot, text } = palette[value];
  return (
    <span className="inline-flex items-center gap-[6px]">
      <span className={`size-[6px] rounded-full ${dot}`} />
      <span className={`font-manrope text-[12px] font-medium ${text}`}>{value}</span>
    </span>
  );
}
