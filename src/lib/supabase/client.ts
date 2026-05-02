// Browser-side Supabase client.  Uses the anon key (public-safe).
// Auth token persists in cookies via @supabase/ssr.

'use client';

import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
