// Wallet sign-in.  Called from the TopNav WalletButton after Turnkey's
// hosted modal returns a wallet address.  Validates the address shape,
// upserts a row in wallet_users (for display-name metadata), signs a
// session JWT, and sets the zeno-session cookie.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { signWalletSession, COOKIE_NAME, MAX_AGE_S } from '@/lib/session';

const WALLET_RE = /^0x[0-9a-fA-F]{40}$/;

export async function POST(req: NextRequest) {
  let body: { walletAddress?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const wallet = typeof body.walletAddress === 'string' ? body.walletAddress.trim() : '';
  if (!WALLET_RE.test(wallet)) {
    return NextResponse.json({ error: 'invalid_wallet' }, { status: 400 });
  }
  const id = wallet.toLowerCase();

  // Upsert wallet_users row (idempotent first-login bookkeeping).
  const admin = createAdminClient();
  const { error: upErr } = await admin
    .from('wallet_users')
    .upsert(
      { id, last_login_at: new Date().toISOString() },
      { onConflict: 'id' },
    );
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  const token = await signWalletSession(id);
  const res = NextResponse.json({ data: { id } });
  res.cookies.set({
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE_S,
  });
  return res;
}
