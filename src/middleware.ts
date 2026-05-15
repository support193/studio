// Auth middleware.
//
// /admin/* — requires a Supabase session in the ADMIN_EMAILS allowlist.
// Everything else is open: anonymous users can browse all pages, and the
// wallet connect button in the TopNav is the entry point for becoming a
// signed-in user.

import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

type CookieSet = { name: string; value: string; options: CookieOptions };

export async function middleware(req: NextRequest) {
  const res = NextResponse.next({ request: req });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookies: CookieSet[]) => {
          cookies.forEach(({ name, value, options }) => {
            res.cookies.set({ name, value, ...options });
          });
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  const path = req.nextUrl.pathname;

  // Admin allowlist — only emails in ADMIN_EMAILS env get past the gate.
  // Even after self-signup, a user not on this list is signed out immediately.
  const adminEmails = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const isAllowedAdmin = !!user && adminEmails.includes((user.email ?? '').toLowerCase());

  // /admin/* requires login + allowlist except /admin/login itself.
  if (path.startsWith('/admin') && path !== '/admin/login') {
    if (!user) {
      const url = req.nextUrl.clone();
      url.pathname = '/admin/login';
      url.searchParams.set('next', path);
      return NextResponse.redirect(url);
    }
    if (!isAllowedAdmin) {
      // Authenticated but not on the allowlist — sign out and redirect.
      await supabase.auth.signOut();
      const url = req.nextUrl.clone();
      url.pathname = '/admin/login';
      url.searchParams.set('error', 'not_allowed');
      return NextResponse.redirect(url);
    }
  }

  // If already an authorized admin and visiting /admin/login, redirect to /admin.
  if (path === '/admin/login' && isAllowedAdmin) {
    const url = req.nextUrl.clone();
    url.pathname = '/admin';
    return NextResponse.redirect(url);
  }

  return res;
}

export const config = {
  matcher: ['/admin/:path*'],
};
