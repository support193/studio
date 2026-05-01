import { Manrope, Zen_Antique } from 'next/font/google';

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
