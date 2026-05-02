// Missions — Figma 10_zeno_studio_ver.1.0.0 / mission frame (4:143318) 1:1.
// 헤더 (3d Studio + subtitle) + 필터 바 + 3-컬럼 카드 그리드.
// Figma 의 카드 7개 중 마지막 1개는 "active/featured" 스타일 (글로우 + brighter border).

'use client';

import Link from 'next/link';
import { Bot, Hand, Flag, Clock, ChevronDown, Search } from 'lucide-react';

type CardCategory = 'hand' | 'robot';

interface MissionCard {
  category: CardCategory;
  taskName: string;
  description: string;
  count: string;        // e.g. "1/5"
  duration: string;     // e.g. "5min"
  buttonLabel: string;  // e.g. "Kitchen"
  href?: string;        // optional route
  disabled?: boolean;
  featured?: boolean;   // 7번째 카드 강조 스타일
  durationDanger?: boolean;
}

const CARDS: MissionCard[] = [
  { category: 'hand',  taskName: 'Task name', description: 'Capture and process 3D hand-tracking sessions', count: '1/5', duration: '5min', buttonLabel: 'Kitchen' },
  { category: 'robot', taskName: 'Task name', description: 'Capture and process 3D hand-tracking sessions', count: '1/5', duration: '5min', buttonLabel: 'Kitchen' },
  { category: 'hand',  taskName: 'Task name', description: 'Capture and process 3D hand-tracking sessions', count: '1/5', duration: '5min', buttonLabel: 'Kitchen' },
  { category: 'robot', taskName: 'Task name', description: 'Capture and process 3D hand-tracking sessions', count: '1/5', duration: '5min', buttonLabel: 'Kitchen' },
  { category: 'hand',  taskName: 'Task name', description: 'Capture and process 3D hand-tracking sessions', count: '1/5', duration: '5min', buttonLabel: 'Kitchen' },
  { category: 'robot', taskName: 'Task name', description: 'Capture and process 3D hand-tracking sessions', count: '1/5', duration: '5min', buttonLabel: 'Kitchen', disabled: true },
  { category: 'hand',  taskName: 'Task name', description: 'Capture and process 3D hand-tracking sessions', count: '1/5', duration: '1m',   buttonLabel: 'Kitchen', featured: true, durationDanger: true, href: '/test' },
];

export default function MissionsPage() {
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
            {/* Filter buttons */}
            <div className="flex items-center gap-[8px]">
              <FilterButton label="Type" />
              <FilterButton label="Status" />
              <ShowAllButton />
            </div>
            {/* Vertical divider */}
            <div className="h-[24px] w-px bg-[#1f1f1f]" />
            {/* Category chips */}
            <div className="flex items-center gap-[8px]">
              <CategoryChip
                category="hand"
                icon={<Hand size={16} strokeWidth={1.5} />}
                label="Hand Demo"
              />
              <CategoryChip
                category="robot"
                icon={<Bot size={16} strokeWidth={1.5} />}
                label="Robot Arm Demo"
              />
            </div>
          </div>
          {/* Search */}
          <div className="flex w-[280px] items-center gap-[8px] rounded-[8px] border border-[#1f1f1f] px-[16px] py-[8px]">
            <Search size={16} strokeWidth={1.5} className="text-[#737780]" />
            <input
              type="text"
              placeholder="Search tasks..."
              className="flex-1 bg-transparent font-manrope text-[12px] font-medium leading-[18px] text-[#f8f9fa] placeholder:text-[#737780] focus:outline-none"
            />
          </div>
        </div>

        {/* Cards grid */}
        <div className="flex flex-wrap gap-[24px]">
          {CARDS.map((card, i) => (
            <MissionCardEl key={i} card={card} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Pieces ─────────────────────────────────────────────────────────

function FilterButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      className="flex items-center gap-[4px] rounded-[8px] border border-[#1f1f1f] py-[8px] pl-[16px] pr-[12px] transition-colors hover:border-[#2a2a2a]"
    >
      <span className="font-manrope text-[12px] font-medium leading-[18px] text-[#737780]">
        {label}
      </span>
      <ChevronDown size={16} strokeWidth={1.5} className="text-[#737780]" />
    </button>
  );
}

function ShowAllButton() {
  return (
    <button
      type="button"
      className="rounded-[8px] border border-[#1f1f1f] px-[16px] py-[8px] font-manrope text-[12px] font-medium leading-[18px] text-[#f8f9fa] transition-colors hover:border-[#2a2a2a]"
    >
      Show All
    </button>
  );
}

function CategoryChip({
  category,
  icon,
  label,
}: {
  category: CardCategory;
  icon: React.ReactNode;
  label: string;
}) {
  const isHand = category === 'hand';
  return (
    <span
      className={[
        'flex items-center gap-[4px] rounded-[8px] py-[8px] pl-[12px] pr-[16px]',
        isHand
          ? 'bg-[rgba(244,163,48,0.15)] text-[#f4a330]'
          : 'bg-[rgba(174,255,24,0.15)] text-[#aeff18]',
      ].join(' ')}
    >
      <span>{icon}</span>
      <span className="font-manrope text-[12px] font-medium leading-[18px]">{label}</span>
    </span>
  );
}

function CategoryBadge({ category }: { category: CardCategory }) {
  // Figma 의 카드 좌상단 chip ("Hand mode" / "Robot Arm").  데코 blob 은 단순화.
  const isHand = category === 'hand';
  return (
    <div className="relative flex items-center gap-[4px] overflow-hidden rounded-[6px] border border-white/80 bg-[rgba(248,249,250,0.05)] px-[12px] py-[7px]">
      {/* decorative dots — simplified from Figma's gradient blobs */}
      <span className="flex items-center gap-[3px]">
        {isHand ? (
          <>
            <span className="size-[6px] rounded-full bg-[#b1b2ff]" />
            <span className="size-[6px] rounded-full bg-[#6c78d8]" />
            <span className="size-[6px] rounded-full bg-[#9fd1ff]" />
          </>
        ) : (
          <>
            <span className="size-[6px] rounded-full bg-[#ff2f6d]" />
            <span className="size-[6px] rounded-full bg-[#ff3d00]" />
            <span className="size-[6px] rounded-full bg-[#138eff]" />
          </>
        )}
      </span>
      <span className="font-manrope text-[12px] font-medium leading-none tracking-[-0.12px] text-white">
        {isHand ? 'Hand mode' : 'Robot Arm'}
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
        card.featured
          ? 'border-[rgba(248,249,250,0.3)] shadow-[0_0_20px_0_rgba(248,249,250,0.25)]'
          : 'border-[rgba(248,249,250,0.1)] bg-[rgba(248,249,250,0.02)]',
      ].join(' ')}
    >
      <div
        className={[
          'relative flex h-[240px] w-full flex-col items-start justify-between overflow-hidden rounded-[16px] p-[20px]',
          card.featured
            ? 'border border-[rgba(248,249,250,0.3)] bg-gradient-to-r from-[rgba(248,249,250,0)] to-[rgba(248,249,250,0.1)]'
            : '',
        ].join(' ')}
      >
        {/* Background plate (gradient overlay — featured 카드는 자체 그라데이션) */}
        {!card.featured && (
          <div className="pointer-events-none absolute inset-0 rounded-[16px]">
            <div
              className="absolute inset-0 backdrop-blur-[21px]"
              style={{
                background:
                  'linear-gradient(-90deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 100%)',
              }}
            />
          </div>
        )}

        {/* Top row — category badge */}
        <div className="relative flex w-full items-center">
          <CategoryBadge category={card.category} />
        </div>

        {/* Bottom row — title + meta + button */}
        <div className="relative flex w-full items-end gap-[20px]">
          <div className="flex min-w-0 flex-1 flex-col gap-[24px]">
            <div className="flex flex-col gap-[4px]">
              <h3 className="font-manrope text-[24px] font-semibold leading-[34px] text-[#f8f9fa]">
                {card.taskName}
              </h3>
              <p className="font-manrope text-[14px] leading-[1.4] text-[#939399]">
                {card.description}
              </p>
            </div>
            <div className="flex items-center gap-[12px]">
              <span className="flex items-center gap-[4px]">
                <Flag size={16} strokeWidth={1.5} className="text-[#87878c]" />
                <span className="font-manrope text-[12px] font-medium leading-[16px] text-[#87878c]">
                  {card.count}
                </span>
              </span>
              <span className="flex items-center gap-[4px]">
                <Clock
                  size={16}
                  strokeWidth={1.5}
                  className={card.durationDanger ? 'text-[#c80000]' : 'text-[#87878c]'}
                />
                <span
                  className={[
                    'font-manrope text-[12px] font-medium leading-[16px]',
                    card.durationDanger ? 'text-[#c80000]' : 'text-[#87878c]',
                  ].join(' ')}
                >
                  {card.duration}
                </span>
              </span>
            </div>
          </div>
          <button
            type="button"
            className="relative flex items-center justify-center rounded-full border-[0.6px] border-[#040404] bg-[rgba(248,249,250,0.02)] px-[16px] py-[10px] backdrop-blur-[2px] transition-colors hover:bg-[rgba(248,249,250,0.06)]"
            style={{
              boxShadow:
                'inset 0px -4px 4px 0px rgba(255,255,255,0.04), inset 0px 4px 4px 0px rgba(0,0,0,0.2)',
            }}
          >
            <span className="font-manrope text-[14px] leading-[1.2] text-[#f8f9fa]">
              {card.buttonLabel}
            </span>
          </button>
        </div>
      </div>
    </div>
  );

  if (card.href && !card.disabled) {
    return (
      <Link href={card.href} className="block">
        {inner}
      </Link>
    );
  }
  return inner;
}
