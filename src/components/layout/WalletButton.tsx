// Top-right "Connect Wallet" / "0x15cb…4Cdc" pill.  Renders inside the
// TopNav.  Server seeds initialUser via cookie so the authed UI is correct
// on first paint; after Turnkey's modal flow completes we POST the wallet
// address to /api/auth/login and refresh.

'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTurnkey, ClientState } from '@turnkey/react-wallet-kit';
import { Wallet, ChevronDown, LogOut } from 'lucide-react';

export interface InitialUser {
  id: string;
  kind: 'wallet' | 'email';
  email?: string | null;
}

export default function WalletButton({ initialUser }: { initialUser: InitialUser | null }) {
  const router = useRouter();
  const { handleLogin, clientState, wallets } = useTurnkey();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ddRef = useRef<HTMLDivElement | null>(null);

  // Sync to /api/auth/login any time Turnkey produces a wallet address that
  // doesn't match our current cookie state.
  const lastSyncedRef = useRef<string | null>(initialUser?.kind === 'wallet' ? initialUser.id : null);

  useEffect(() => {
    if (clientState !== ClientState.Ready) return;
    const addr = wallets[0]?.accounts?.[0]?.address;
    if (!addr) return;
    const lower = addr.toLowerCase();
    if (lastSyncedRef.current === lower) return;
    lastSyncedRef.current = lower;
    (async () => {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: lower }),
      });
      if (res.ok) router.refresh();
    })().catch(() => { /* network error — user can retry */ });
  }, [clientState, wallets, router]);

  // Close the dropdown when clicking outside it.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ddRef.current && !ddRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  async function onConnect() {
    if (busy) return;
    setBusy(true);
    try {
      await handleLogin();
    } finally {
      setBusy(false);
    }
  }

  async function onDisconnect() {
    setOpen(false);
    await fetch('/api/auth/logout', { method: 'POST' });
    router.refresh();
  }

  // ── Authenticated rendering ─────────────────────────────────────────
  if (initialUser) {
    const label = initialUser.kind === 'email'
      ? (initialUser.email ?? 'admin')
      : shortenAddress(initialUser.id);
    return (
      <div className="relative" ref={ddRef}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 rounded-full border border-[#1f1f1f] bg-[rgba(248,249,250,0.04)] py-[6px] pl-[12px] pr-[10px] backdrop-blur-[2px] hover:bg-[rgba(248,249,250,0.08)]"
        >
          {initialUser.kind === 'wallet' && (
            <span className="size-[20px] rounded-full" style={{ backgroundImage: gradientFor(initialUser.id) }} />
          )}
          <span className="font-manrope text-[13px] leading-none text-[#f8f9fa]">{label}</span>
          <ChevronDown size={14} className="text-[#a8a8b0]" />
        </button>
        {open && (
          <div className="absolute right-0 top-[calc(100%+6px)] z-50 min-w-[200px] rounded-[10px] border border-[#1f1f1f] bg-[#0a0a0a] p-1 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.8)]">
            <div className="border-b border-[#1f1f1f] px-3 py-2">
              <div className="font-manrope text-[10px] uppercase tracking-wider text-[#737780]">
                {initialUser.kind === 'wallet' ? 'Wallet' : 'Admin'}
              </div>
              <div className="break-all font-mono text-[10px] text-[#a8a8b0]">{initialUser.id}</div>
            </div>
            <button
              type="button"
              onClick={onDisconnect}
              className="flex w-full items-center gap-2 rounded-[6px] px-3 py-2 font-manrope text-[12px] text-[#a8a8b0] hover:bg-[rgba(248,249,250,0.04)] hover:text-white"
            >
              <LogOut size={12} /> {initialUser.kind === 'wallet' ? 'Disconnect' : 'Sign out'}
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── Anonymous rendering ─────────────────────────────────────────────
  const ready = clientState === ClientState.Ready;
  return (
    <button
      type="button"
      onClick={onConnect}
      disabled={busy || !ready}
      className="flex items-center gap-2 rounded-full border border-[#040404] bg-[rgba(248,249,250,0.04)] px-[14px] py-[8px] font-manrope text-[13px] text-[#f8f9fa] backdrop-blur-[2px] transition-colors hover:bg-[rgba(248,249,250,0.08)] disabled:opacity-50"
    >
      <Wallet size={14} strokeWidth={1.75} />
      {busy ? 'Connecting…' : ready ? 'Connect Wallet' : 'Initializing…'}
    </button>
  );
}

function shortenAddress(addr: string): string {
  if (addr.length < 10) return addr;
  return addr.slice(0, 6) + '…' + addr.slice(-4);
}

function gradientFor(seed: string): string {
  // Stable, deterministic gradient from the address chars.
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) & 0xffffffff;
  const a = Math.abs(h) % 360;
  const b = (a + 80) % 360;
  return `linear-gradient(135deg, hsl(${a} 70% 60%), hsl(${b} 70% 35%))`;
}
