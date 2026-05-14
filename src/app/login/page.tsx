'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}

type Mode = 'signin' | 'signup';

function Inner() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get('next') || '/missions';
  const initialMode: Mode = sp.get('mode') === 'signup' ? 'signup' : 'signin';

  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);
    const supabase = createClient();

    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (error) {
        setError(error.message);
        return;
      }
      router.replace(next);
      router.refresh();
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password });
      setLoading(false);
      if (error) {
        setError(error.message);
        return;
      }
      // If email confirmation is required by the project, session will be null.
      if (data.session) {
        router.replace(next);
        router.refresh();
      } else {
        setInfo('Check your inbox to confirm your email, then sign in.');
        setMode('signin');
      }
    }
  }

  const isSignup = mode === 'signup';

  return (
    <div className="flex min-h-[calc(100vh-52px)] items-center justify-center px-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-[16px] border border-[rgba(248,249,250,0.1)] bg-[rgba(248,249,250,0.02)] p-6"
      >
        <h1 className="font-manrope mb-1 text-[24px] font-semibold text-[#f8f9fa]">
          {isSignup ? 'Create account' : 'Sign in'}
        </h1>
        <p className="font-manrope mb-6 text-[12px] text-[#939399]">
          {isSignup
            ? 'Sign up to start playing missions.'
            : 'Sign in to play missions.'}
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
            autoComplete={isSignup ? 'new-password' : 'current-password'}
            required
            minLength={6}
            className="w-full rounded-[8px] border border-[#1f1f1f] bg-transparent px-3 py-2 font-manrope text-[14px] text-[#f8f9fa] focus:border-[#7C5CFC] focus:outline-none"
          />
        </label>

        {error && (
          <div className="mb-4 rounded-[6px] border border-red-700 bg-red-900/20 px-3 py-2 text-[12px] text-red-300">
            {error}
          </div>
        )}
        {info && (
          <div className="mb-4 rounded-[6px] border border-emerald-700 bg-emerald-900/20 px-3 py-2 text-[12px] text-emerald-300">
            {info}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-full border border-[#040404] bg-[rgba(248,249,250,0.06)] py-2.5 font-manrope text-[14px] text-[#f8f9fa] hover:bg-[rgba(248,249,250,0.1)] disabled:opacity-50"
        >
          {loading ? (isSignup ? 'Creating…' : 'Signing in…') : isSignup ? 'Create account' : 'Sign in'}
        </button>

        <div className="mt-4 text-center font-manrope text-[12px] text-[#737780]">
          {isSignup ? (
            <>
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => { setMode('signin'); setError(null); setInfo(null); }}
                className="text-[#a48dff] hover:underline"
              >
                Sign in
              </button>
            </>
          ) : (
            <>
              New here?{' '}
              <button
                type="button"
                onClick={() => { setMode('signup'); setError(null); setInfo(null); }}
                className="text-[#a48dff] hover:underline"
              >
                Create an account
              </button>
            </>
          )}
        </div>

        <div className="mt-6 border-t border-[#1f1f1f] pt-4 text-center">
          <Link href="/missions" className="font-manrope text-[12px] text-[#737780] hover:text-[#f8f9fa]">
            Back to missions
          </Link>
        </div>
      </form>
    </div>
  );
}
