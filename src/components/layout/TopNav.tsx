// Top nav — logo left, wallet button right.

'use client';

import Link from 'next/link';
import WalletButton, { type InitialUser } from './WalletButton';

export default function TopNav({ initialUser }: { initialUser: InitialUser | null }) {
  return (
    <nav className="fixed inset-x-0 top-0 z-50 h-[52px] border-b border-[#1a1a1a] bg-[rgba(3,3,3,0.96)] backdrop-blur-[28px]">
      <div className="flex h-full items-center justify-between px-[18px]">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex h-[40px] w-[40px] items-center justify-center rounded-full border border-[#1a1a1a] bg-[#0a0a0f]">
            <span className="font-zen-antique text-[16px] tracking-wide text-[#f8f9fa]">Z</span>
          </span>
          <span className="font-zen-antique text-[18px] tracking-[0.18em] text-[#f8f9fa]">
            ZENO <span className="text-[#7C5CFC]">STUDIO</span>
          </span>
        </Link>
        <WalletButton initialUser={initialUser} />
      </div>
    </nav>
  );
}
