// Studio sidebar — Figma 10_zeno_studio_ver.1.0.0 의 GNB 구조 포팅.
//   - 카테고리 그룹: 3d Studio (collapsible)
//     - Mission
//     - Test
//   - 데모용이라 Dashboard / Video 그룹은 생략 (사용자 명시: "미션이랑 테스트만").

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Box, ChevronUp, Shield } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

type SubItem = { href: string; label: string };

const STUDIO_ITEMS: SubItem[] = [
  { href: '/missions', label: 'Mission' },
  { href: '/test',     label: 'Test' },
];

export default function Sidebar({ isAuthed = false }: { isAuthed?: boolean }) {
  const pathname = usePathname();
  const [studioOpen, setStudioOpen] = useState(true);

  const studioActive = STUDIO_ITEMS.some((it) => pathname === it.href || pathname.startsWith(it.href + '/'));

  return (
    <aside className="fixed top-[52px] bottom-0 left-0 z-40 hidden w-[240px] border-r border-[#1a1a1a] bg-[#030303] md:block">
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
                    'flex w-[216px] items-center rounded-[8px] p-[12px] transition-colors',
                    active
                      ? 'bg-gradient-sidebar-active text-[#f8f9fa]'
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

        {/* Admin — only visible when signed in. */}
        {isAuthed && (
          <Link
            href="/admin"
            className={cn(
              'mt-auto flex w-[216px] items-center justify-between rounded-[8px] p-[12px] transition-colors',
              pathname.startsWith('/admin')
                ? 'bg-gradient-sidebar-active text-[#f8f9fa]'
                : 'text-[#535357] hover:text-[#f8f9fa]',
            )}
          >
            <span className="flex items-center gap-[10px]">
              <Shield size={20} strokeWidth={1.5} />
              <span className="font-manrope text-[14px] leading-[1.4]">Admin</span>
            </span>
          </Link>
        )}
      </nav>
    </aside>
  );
}
