import { Cinzel } from 'next/font/google';

// Cinzel Decorative is also available, but regular Cinzel is more stable
export const cinzel = Cinzel({
  subsets: ['latin'],
  weight: ['400', '700', '900'], // Use 700/900 for a stronger navigation presence
});
