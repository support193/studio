// Auth middleware — gate /admin/* behind a valid Supabase session.
// /admin/login is exempt so unauthenticated users can sign in.

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
  // Self-signup하더라도 이 화이트리스트에 없으면 즉시 로그아웃 + 차단.
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
