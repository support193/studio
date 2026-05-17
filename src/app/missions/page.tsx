// Missions catalog — Figma 10_zeno_studio_ver.1.0.0 / mission frame (4:143318) 1:1.
// Server-rendered: fetches missions from Supabase (public read) and, when the
// visitor is signed in, merges in their per-mission attempt counter.

import Link from 'next/link';
import { Bot, Flag, Clock, ChevronDown, Search } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getServerUser } from '@/lib/auth/server-user';

export const dynamic = 'force-dynamic';

interface MissionRow {
  id: string;
  title: string;
  goal: string | null;
  time_limit_s: number;
  max_attempts: number;
}

interface AttemptRow {
  mission_id: string;
  attempts: number;
}

interface MissionCard {
  id: string;
  taskName: string;
  description: string;
  count: string;
  duration: string;
  href: string;
  disabled: boolean;
  durationDanger: boolean;
}

function formatDuration(sec: number): string {
  if (sec < 60) return `${sec}s`;
  if (sec % 60 === 0) return `${sec / 60}min`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

export default async function MissionsPage() {
  const supabase = await createClient();

  // Public read (anon RLS allows SELECT).
  const { data: missionsData } = await supabase
    .from('missions')
    .select('id, title, goal, time_limit_s, max_attempts')
    .order('title', { ascending: true });
  const missions = (missionsData ?? []) as MissionRow[];

  // Per-user attempt counts (only when signed in).  Wallet users have no
  // auth.uid() so we read via service-role + manual user_id filter.
  const user = await getServerUser();
  const attemptsByMission: Record<string, number> = {};
  if (user) {
    const admin = createAdminClient();
    const { data: attemptsData } = await admin
      .from('mission_attempts')
      .select('mission_id, attempts')
      .eq('user_id', user.id);
    for (const row of (attemptsData ?? []) as AttemptRow[]) {
      attemptsByMission[row.mission_id] = row.attempts;
    }
  }

  const cards: MissionCard[] = missions.map((m) => {
    const used = attemptsByMission[m.id] ?? 0;
    const exhausted = used >= m.max_attempts;
    return {
      id: m.id,
      taskName: m.title,
      description: m.goal ?? '',
      count: `${used}/${m.max_attempts}`,
      duration: formatDuration(m.time_limit_s),
      // Non-signed-in users still see the catalog and can click in to
      // play anonymously (no attempt is logged).
      href: `/missions/${m.id}/play`,
      disabled: exhausted,
      durationDanger: m.time_limit_s <= 60,
    };
  });

  return (
    <div className="px-[24px] pb-[40px]">
      {/* Page header */}
      <div className="flex flex-col gap-[8px] py-[32px]">
        <h1 className="font-manrope text-[32px] font-semibold leading-[1.2] text-[#f8f9fa]">
          3d Studio
        </h1>
        <p className="font-manrope text-[14px] leading-[1.4] text-[#939399]">
          Capture and process 3D hand-tracking sessions
        </p>
      </div>

      {/* Filter bar */}
      <div className="flex flex-col gap-[28px]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-[16px]">
            <div className="flex items-center gap-[8px]">
              <FilterButton label="Type" />
              <FilterButton label="Status" />
              <ShowAllButton />
            </div>
            <div className="h-[24px] w-px bg-[#1f1f1f]" />
            <div className="flex items-center gap-[8px]">
              <CategoryChip
                icon={<Bot size={16} strokeWidth={1.5} />}
                label="Robot Arm Demo"
              />
            </div>
          </div>
          <div className="flex w-[280px] items-center gap-[8px] rounded-[8px] border border-[var(--st-border)] px-[16px] py-[8px]">
            <Search size={16} strokeWidth={1.5} className="text-[var(--st-fg-2)]" />
            <input
              type="text"
              placeholder="Search tasks..."
              className="flex-1 bg-transparent font-manrope text-[12px] font-medium leading-[18px] text-[#f8f9fa] placeholder:text-[var(--st-fg-2)] focus:outline-none"
            />
          </div>
        </div>

        {/* Cards grid */}
        {cards.length === 0 ? (
          <div className="rounded-[16px] border border-dashed border-[#1f1f1f] py-16 text-center">
            <p className="font-manrope text-[14px] text-[var(--st-fg-2)]">No missions yet.</p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-[24px]">
            {cards.map((card) => (
              <MissionCardEl key={card.id} card={card} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Pieces ─────────────────────────────────────────────────────────

function FilterButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      className="flex items-center gap-[4px] rounded-[8px] border border-[var(--st-border)] py-[8px] pl-[16px] pr-[12px] transition-colors hover:border-[var(--st-border-2)]"
    >
      <span className="font-manrope text-[12px] font-medium leading-[18px] text-[var(--st-fg-2)]">
        {label}
      </span>
      <ChevronDown size={16} strokeWidth={1.5} className="text-[var(--st-fg-2)]" />
    </button>
  );
}

function ShowAllButton() {
  return (
    <button
      type="button"
      className="rounded-[8px] border border-[var(--st-border)] px-[16px] py-[8px] font-manrope text-[12px] font-medium leading-[18px] text-[#f8f9fa] transition-colors hover:border-[var(--st-border-2)]"
    >
      Show All
    </button>
  );
}

function CategoryChip({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <span className="flex items-center gap-[4px] rounded-[8px] border border-[rgba(88,86,214,0.5)] bg-[rgba(88,86,214,0.10)] py-[8px] pl-[12px] pr-[16px] text-[#c5c3ff]">
      <span>{icon}</span>
      <span className="font-manrope text-[12px] font-medium leading-[18px]">{label}</span>
    </span>
  );
}

function CategoryBadge() {
  return (
    <div className="relative flex items-center gap-[4px] overflow-hidden rounded-[6px] border border-white/80 bg-[rgba(248,249,250,0.05)] px-[12px] py-[7px]">
      <span className="flex items-center gap-[3px]">
        <span className="size-[6px] rounded-full bg-white" />
        <span className="size-[6px] rounded-full bg-white/70" />
        <span className="size-[6px] rounded-full bg-[#5856d6]" />
      </span>
      <span className="font-manrope text-[12px] font-medium leading-none tracking-[-0.12px] text-white">
        Robot Arm
      </span>
    </div>
  );
}

function MissionCardEl({ card }: { card: MissionCard }) {
  const inner = (
    <div
      className={[
        'flex w-[528px] flex-col items-start rounded-[20px] border p-[12px]',
        card.disabled ? 'opacity-30' : '',
        'border-[var(--st-border)] bg-[var(--st-glass)]',
      ].join(' ')}
    >
      <div
        className="relative flex h-[240px] w-full flex-col items-start justify-between overflow-hidden rounded-[16px] border border-[rgba(255,255,255,0.10)] p-[20px]"
        style={{
          background: 'linear-gradient(135deg, rgba(44,43,107,0.7) 0%, rgba(17,16,42,0.65) 60%, rgba(6,6,10,0.5) 100%)',
          backdropFilter: 'blur(21px)',
        }}
      >
        {/* Indigo glow ring — top-right (design/Missions.jsx) */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute"
          style={{
            right: -60, top: -60, width: 200, height: 200, borderRadius: 999,
            background: 'radial-gradient(circle, rgba(88,86,214,0.45), transparent 70%)',
            filter: 'blur(20px)',
          }}
        />
        {/* Noise / grain texture overlay — Figma uses mix-blend-mode: soft-light
            with opacity ~0.2 to add a subtle "fabric" feel.  Generated via
            inline SVG <feTurbulence> so no external asset is required. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[16px]"
          style={{
            backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/></svg>")`,
            mixBlendMode: 'soft-light',
            opacity: 0.2,
          }}
        />

        {/* Top row — category badge */}
        <div className="relative flex w-full items-center">
          <CategoryBadge />
        </div>

        {/* Bottom row — title + meta + button */}
        <div className="relative flex w-full items-end gap-[20px]">
          <div className="flex min-w-0 flex-1 flex-col gap-[24px]">
            <div className="flex flex-col gap-[4px]">
              <h3 className="font-manrope text-[24px] font-semibold leading-[34px] text-[#f8f9fa]">
                {card.taskName}
              </h3>
              {card.description && (
                <p className="font-manrope line-clamp-2 text-[14px] leading-[1.4] text-[#939399]">
                  {card.description}
                </p>
              )}
            </div>
            <div className="flex items-center gap-[12px]">
              <span className="flex items-center gap-[4px]">
                <Flag size={16} strokeWidth={1.5} className="text-[var(--st-fg-2)]" />
                <span className="font-manrope text-[12px] font-medium leading-[16px] text-[var(--st-fg-2)]">
                  {card.count}
                </span>
              </span>
              <span className="flex items-center gap-[4px]">
                <Clock
                  size={16}
                  strokeWidth={1.5}
                  className={card.durationDanger ? 'text-[#f8f9fa]' : 'text-[var(--st-fg-2)]'}
                />
                <span
                  className={[
                    'font-manrope text-[12px] font-medium leading-[16px]',
                    card.durationDanger ? 'text-[#f8f9fa]' : 'text-[var(--st-fg-2)]',
                  ].join(' ')}
                >
                  {card.duration}
                </span>
              </span>
            </div>
          </div>
          <button
            type="button"
            className="st-btn st-btn--glass relative flex items-center justify-center rounded-full px-[18px] py-[10px]"
          >
            <span className="font-manrope text-[14px] leading-[1.2] text-[#f8f9fa]">
              {card.disabled ? 'No tries left' : 'Play'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );

  if (card.disabled) return inner;
  return (
    <Link href={card.href} className="block">
      {inner}
    </Link>
  );
}
