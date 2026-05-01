// Studio sidebar — pipeline 의 디자인 스타일 (token / gradient / Zen Antique
// badge font) 그대로 유지하되 auth / role / API call 은 전부 제거.
// 메뉴 항목은 미션 + 테스트 (확장 예정).

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Target, FlaskConical } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

type SidebarItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  isBeta?: boolean;
};

const ITEMS: SidebarItem[] = [
  { href: '/missions', label: 'Missions', icon: Target },
  { href: '/test',     label: 'Test',     icon: FlaskConical, isBeta: true },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="border-border bg-background sticky top-0 left-0 z-40 hidden h-screen w-60 border-r md:block">
      {/* Brand header */}
      <div className="border-b border-border-subtle px-5 py-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="font-zen-antique text-base text-sidebar-foreground tracking-wide">
            ZenO Studio
          </span>
        </Link>
      </div>

      <nav className="px-3 py-4">
        <ul className="flex flex-col gap-1">
          {ITEMS.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex w-full items-center justify-between rounded-lg p-3 text-sm transition-all duration-200',
                    isActive
                      ? 'bg-gradient-sidebar-active text-sidebar-foreground'
                      : 'text-sidebar-muted-foreground hover:text-sidebar-foreground',
                  )}
                >
                  <span className="flex items-center gap-2.5">
                    <Icon
                      size={20}
                      strokeWidth={1.5}
                      className={cn(
                        isActive ? 'text-sidebar-foreground' : 'text-sidebar-muted-foreground',
                      )}
                    />
                    {item.label}
                  </span>
                  {item.isBeta && (
                    <span className="text-sidebar-foreground bg-gradient-sidebar-badge font-zen-antique rounded-full border border-[#313238] px-1.5 py-1 text-[10px]/[12px]">
                      Beta
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
