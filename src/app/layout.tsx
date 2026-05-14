import type { Metadata } from 'next';
import { manrope, zenAntique } from '@/lib/fonts';
import ChromeShell from '@/components/layout/ChromeShell';
import './globals.css';

export const metadata: Metadata = {
  title: 'ZenO Studio',
  description: 'Interactive Franka Panda arm in your browser. MuJoCo physics + analytical IK.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${manrope.variable} ${zenAntique.variable} bg-[#030303] text-[#f8f9fa]`}>
        <ChromeShell>{children}</ChromeShell>
      </body>
    </html>
  );
}
