// Server-side "who is the (wallet) user?" helper.
//
// IMPORTANT: this is wallet-only on purpose.  Admin email/password auth
// (Supabase sb-* cookie) is scoped exclusively to /admin/* — it must NOT
// leak into the public surfaces (TopNav, missions, xp-station), otherwise
// an admin who logged into /admin would appear "logged in" everywhere and
// the wallet Connect button would never show.  Admin sign-out lives in
// src/app/admin/LogoutButton.tsx.

import { readWalletSession } from '@/lib/session';

export interface ServerUser {
  id: string;            // wallet address (lowercased)
  kind: 'wallet';
}

export async function getServerUser(): Promise<ServerUser | null> {
  const wallet = await readWalletSession();
  if (wallet?.uid) {
    return { id: wallet.uid, kind: 'wallet' };
  }
  return null;
}
