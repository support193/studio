'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function AdminLoginPage() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}

function Inner() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get('next') || '/admin';
  const errCode = sp.get('error');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(
    errCode === 'not_allowed' ? 'This account is not authorized for admin access.' : null,
  );
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.replace(next);
    router.refresh();
  }

  return (
    <div className="flex min-h-[calc(100vh-52px)] items-center justify-center px-6">
      <form onSubmit={onSubmit} className="w-full max-w-sm rounded-[16px] border border-[rgba(248,249,250,0.1)] bg-[rgba(248,249,250,0.02)] p-6">
        <h1 className="font-manrope mb-1 text-[24px] font-semibold text-[#f8f9fa]">Admin sign in</h1>
        <p className="font-manrope mb-6 text-[12px] text-[#939399]">
          ZenO Studio admin only.
        </p>

        <label className="mb-4 block">
          <span className="font-manrope mb-1 block text-[11px] font-medium uppercase tracking-wider text-[#737780]">
            Email
          </span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            className="w-full rounded-[8px] border border-[#1f1f1f] bg-transparent px-3 py-2 font-manrope text-[14px] text-[#f8f9fa] focus:border-[#7C5CFC] focus:outline-none"
          />
        </label>

        <label className="mb-6 block">
          <span className="font-manrope mb-1 block text-[11px] font-medium uppercase tracking-wider text-[#737780]">
            Password
          </span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            className="w-full rounded-[8px] border border-[#1f1f1f] bg-transparent px-3 py-2 font-manrope text-[14px] text-[#f8f9fa] focus:border-[#7C5CFC] focus:outline-none"
          />
        </label>

        {error && (
          <div className="mb-4 rounded-[6px] border border-red-700 bg-red-900/20 px-3 py-2 text-[12px] text-red-300">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-full border border-[#040404] bg-[rgba(248,249,250,0.06)] py-2.5 font-manrope text-[14px] text-[#f8f9fa] hover:bg-[rgba(248,249,250,0.1)] disabled:opacity-50"
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
