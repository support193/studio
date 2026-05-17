import { Manrope, Zen_Antique } from 'next/font/google';
import localFont from 'next/font/local';

export const manrope = Manrope({
  variable: '--font-manrope',
  subsets: ['latin'],
  weight: ['200', '300', '400', '500', '600', '700', '800'],
  display: 'swap',
});

export const zenAntique = Zen_Antique({
  variable: '--font-zen-antique',
  subsets: ['latin'],
  weight: ['400'],
  display: 'swap',
});

// Pretendard — bilingual (Latin + Hangul) variable face from the DesignCode
// restyle handoff.  Exposed as `--font-pretendard`; globals.css remaps the
// existing `--font-manrope` Tailwind token to this, so the `font-manrope`
// utility (~18 files) renders Pretendard without touching those files.
export const pretendard = localFont({
  src: './fonts/PretendardVariable.woff2',
  variable: '--font-pretendard',
  weight: '100 900',
  display: 'swap',
});
