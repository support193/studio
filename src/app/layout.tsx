import type { Metadata } from 'next';
import { manrope, zenAntique } from '@/lib/fonts';
import './globals.css';

export const metadata: Metadata = {
  title: 'ZenO Robot — Franka Panda Demo',
  description: 'Interactive Franka Panda arm in your browser. MuJoCo physics + analytical IK.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${manrope.variable} ${zenAntique.variable}`}>
        {children}
      </body>
    </html>
  );
}
