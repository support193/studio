import type { Metadata } from 'next';
import { manrope, zenAntique } from '@/lib/fonts';
import Sidebar from '@/components/layout/Sidebar';
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
      <body className={`${manrope.variable} ${zenAntique.variable}`}>
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </body>
    </html>
  );
}
