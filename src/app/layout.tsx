import type { Metadata } from 'next';
import { manrope, zenAntique } from '@/lib/fonts';
import Sidebar from '@/components/layout/Sidebar';
import TopNav from '@/components/layout/TopNav';
import { createClient } from '@/lib/supabase/server';
import './globals.css';

export const metadata: Metadata = {
  title: 'ZenO Studio',
  description: 'Interactive Franka Panda arm in your browser. MuJoCo physics + analytical IK.',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Best-effort auth check — if Supabase env not yet set, still render.
  let isAuthed = false;
  try {
    if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      isAuthed = !!user;
    }
  } catch {
    /* missing env or transient — fall back to anonymous */
  }

  return (
    <html lang="en">
      <body className={`${manrope.variable} ${zenAntique.variable} bg-[#030303] text-[#f8f9fa]`}>
        <TopNav />
        <Sidebar isAuthed={isAuthed} />
        <main className="min-h-screen pt-[52px] md:pl-[240px]">{children}</main>
      </body>
    </html>
  );
}
