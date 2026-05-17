// Top nav — logo left, wallet button right.

'use client';

import Link from 'next/link';
import WalletButton, { type InitialUser } from './WalletButton';

export default function TopNav({ initialUser }: { initialUser: InitialUser | null }) {
  return (
    <nav className="fixed inset-x-0 top-0 z-50 h-[52px] border-b border-[var(--st-border)] bg-[rgba(6,6,10,0.7)] backdrop-blur-[28px]">
      <div className="flex h-full items-center justify-between px-[18px]">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex h-[40px] w-[40px] items-center justify-center rounded-full border border-[var(--st-border-2)] bg-[var(--st-bg-2)]">
            <span className="font-zen-antique text-[16px] tracking-wide text-[#f8f9fa]">Z</span>
          </span>
          <span className="font-zen-antique text-[18px] tracking-[0.18em] text-[#f8f9fa]">
            ZENO <span className="text-[#5856d6]">STUDIO</span>
          </span>
        </Link>
        <WalletButton initialUser={initialUser} />
      </div>
    </nav>
  );
}
