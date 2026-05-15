import type { Metadata } from 'next';
import { manrope, zenAntique } from '@/lib/fonts';
import Providers from '@/components/layout/Providers';
import ChromeShell from '@/components/layout/ChromeShell';
import { getServerUser } from '@/lib/auth/server-user';
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
  const user = await getServerUser();
  const initialUser = user
    ? { id: user.id, kind: user.kind, email: user.email ?? null }
    : null;

  return (
    <html lang="en">
      <body className={`${manrope.variable} ${zenAntique.variable} bg-[#030303] text-[#f8f9fa]`}>
        <Providers>
          <ChromeShell initialUser={initialUser}>{children}</ChromeShell>
        </Providers>
      </body>
    </html>
  );
}
