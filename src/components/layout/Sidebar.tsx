// Studio sidebar — Figma 10_zeno_studio_ver.1.0.0 GNB structure.
// One category: "3d Studio" with Mission + Test sub-items.  Admin is intentionally
// NOT linked from here — admins reach it by typing /admin directly.

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Box, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

type SubItem = { href: string; label: string };

const STUDIO_ITEMS: SubItem[] = [
  { href: '/missions',    label: 'Mission' },
  { href: '/explore',     label: 'Explore' },
  { href: '/test',        label: 'Test' },
  { href: '/xp-station',  label: 'XP Station' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [studioOpen, setStudioOpen] = useState(true);

  const studioActive = STUDIO_ITEMS.some(
    (it) => pathname === it.href || pathname.startsWith(it.href + '/'),
  );

  return (
    <aside className="fixed top-[52px] bottom-0 left-0 z-40 hidden w-[240px] border-r border-[var(--st-border)] bg-[rgba(6,6,10,0.6)] backdrop-blur-[28px] md:block">
      <nav className="flex flex-col items-center justify-center gap-[4px] px-[12px] py-[16px]">
        {/* 3d Studio category header */}
        <button
          type="button"
          onClick={() => setStudioOpen((v) => !v)}
          className={cn(
            'flex w-[216px] items-center justify-between rounded-[8px] p-[12px] transition-colors',
            studioActive ? 'text-[#f8f9fa]' : 'text-[#535357] hover:text-[#f8f9fa]',
          )}
        >
          <span className="flex items-center gap-[10px]">
            <Box size={20} strokeWidth={1.5} />
            <span className="font-manrope text-[14px] leading-[1.4]">3d Studio</span>
          </span>
          <ChevronUp
            size={16}
            strokeWidth={1.5}
            className={cn('transition-transform duration-200', studioOpen ? '' : 'rotate-180')}
          />
        </button>

        {/* Sub-items */}
        {studioOpen && (
          <>
            {STUDIO_ITEMS.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex w-[216px] items-center rounded-[8px] border-l-2 border-transparent p-[12px] transition-colors',
                    active
                      ? 'border-[#5856d6] bg-gradient-to-r from-[rgba(88,86,214,0.20)] to-[rgba(88,86,214,0.04)] text-[#f8f9fa]'
                      : 'text-[#535357] hover:text-[#f8f9fa]',
                  )}
                >
                  <span className="flex items-center gap-[10px]">
                    <span className="size-[20px] opacity-0" /> {/* icon spacer */}
                    <span className="font-manrope text-[14px] leading-[1.4]">{item.label}</span>
                  </span>
                </Link>
              );
            })}
          </>
        )}
      </nav>
    </aside>
  );
}
