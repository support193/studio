// Server-side Supabase client.  Reads/writes the auth cookie via
// next/headers so RLS can identify the user.

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

type CookieSet = { name: string; value: string; options: CookieOptions };

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet: CookieSet[]) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Components can't set cookies — ignore (middleware handles it).
          }
        },
      },
    },
  );
}
