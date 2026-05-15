// Unified server-side "who is calling?" helper.
//
// Two parallel auth schemes:
//   - 'wallet'  → Turnkey-issued zeno-session JWT (user_id = wallet address)
//   - 'email'   → Supabase email/password (user_id = auth.users.id uuid, for admins)
//
// Returns { id, kind } or null when neither cookie is present.  Server
// pages and API routes use this as the single source of truth.

import { createClient } from '@/lib/supabase/server';
import { readWalletSession } from '@/lib/session';

export type AuthKind = 'wallet' | 'email';

export interface ServerUser {
  id: string;            // wallet address (lowercased) or auth.users uuid
  kind: AuthKind;
  email?: string;        // present for email-auth admins
}

export async function getServerUser(): Promise<ServerUser | null> {
  // Wallet first — Turnkey is the primary user-facing auth.
  const wallet = await readWalletSession();
  if (wallet?.uid) {
    return { id: wallet.uid, kind: 'wallet' };
  }

  // Admin fallback — Supabase email/password.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    return { id: user.id, kind: 'email', email: user.email ?? undefined };
  }

  return null;
}
