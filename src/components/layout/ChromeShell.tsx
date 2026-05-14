// Switches between two layouts based on URL:
//   - /admin/*   : no public chrome, full-bleed main.
//   - everything else: TopNav + Sidebar + padded main (Figma layout).

'use client';

import { usePathname } from 'next/navigation';
import TopNav from './TopNav';
import Sidebar from './Sidebar';

export default function ChromeShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '';
  const isAdmin = pathname === '/admin' || pathname.startsWith('/admin/');

  if (isAdmin) {
    return <main className="min-h-screen">{children}</main>;
  }

  return (
    <>
      <TopNav />
      <Sidebar />
      <main className="min-h-screen pt-[52px] md:pl-[240px]">{children}</main>
    </>
  );
}
