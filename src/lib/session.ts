// Custom session JWT for Turnkey-authenticated (wallet) users.
//
// Admins still use Supabase email/password (sb-* cookies); wallet users get
// a separate `zeno-session` cookie signed with SESSION_SECRET.  The two
// schemes coexist — middleware + server pages read whichever is present.

import { SignJWT, jwtVerify } from 'jose';
import type { NextRequest } from 'next/server';
import { cookies } from 'next/headers';

export const COOKIE_NAME = 'zeno-session';
export const MAX_AGE_S = 60 * 60 * 24 * 30;   // 30 days

interface Payload {
  uid: string;   // wallet address (lowercased) — the user_id used across our DB
}

function secret(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error('SESSION_SECRET not configured');
  return new TextEncoder().encode(s);
}

export async function signWalletSession(walletAddress: string): Promise<string> {
  const uid = walletAddress.toLowerCase();
  return new SignJWT({ uid } satisfies Payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_S}s`)
    .sign(secret());
}

export async function verifyWalletSession(token: string): Promise<Payload | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (typeof payload.uid !== 'string') return null;
    return { uid: payload.uid };
  } catch {
    return null;
  }
}

// Edge-runtime friendly read from a NextRequest (used in middleware).
export async function readWalletSessionFromRequest(req: NextRequest): Promise<Payload | null> {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyWalletSession(token);
}

// Server-component / API-route helper.
export async function readWalletSession(): Promise<Payload | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyWalletSession(token);
}
