import type { Metadata } from 'next';
import { manrope, zenAntique } from '@/lib/fonts';
import Sidebar from '@/components/layout/Sidebar';
import TopNav from '@/components/layout/TopNav';
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
        <TopNav />
        <Sidebar />
        <main className="min-h-screen pt-[52px] md:pl-[240px]">{children}</main>
      </body>
    </html>
  );
}
