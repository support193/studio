// Top nav — Figma 10_zeno_studio_ver.1.0.0 의 nav 컴포넌트 포팅.
// 좌측 로고만, 우측 admin/wallet 영역은 공용 데모 라 제외.

'use client';

import Link from 'next/link';

export default function TopNav() {
  return (
    <nav className="fixed inset-x-0 top-0 z-50 h-[52px] border-b border-[#1a1a1a] bg-[rgba(3,3,3,0.96)] backdrop-blur-[28px]">
      <div className="flex h-full items-center justify-between px-[18px]">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3">
          <span className="flex h-[40px] w-[40px] items-center justify-center rounded-full border border-[#1a1a1a] bg-[#0a0a0f]">
            <span className="font-zen-antique text-[16px] tracking-wide text-[#f8f9fa]">Z</span>
          </span>
          <span className="font-zen-antique text-[18px] tracking-[0.18em] text-[#f8f9fa]">
            ZENO <span className="text-[#7C5CFC]">STUDIO</span>
          </span>
        </Link>
      </div>
    </nav>
  );
}
