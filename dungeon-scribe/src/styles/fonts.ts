import { Cinzel } from 'next/font/google';

// Cinzel Decorative 也可以，但常规 Cinzel 更稳妥
export const cinzel = Cinzel({
  subsets: ['latin'],
  weight: ['400', '700', '900'], // 导航用 700/900 比较有气势
});
