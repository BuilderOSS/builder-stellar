// Fetched by Next at build time and self-hosted; no runtime font CDN. The CSS
// variables are what the `fonts` tokens read (tokens.ts).
import { Bricolage_Grotesque, Figtree, JetBrains_Mono } from 'next/font/google';

export const displayFont = Bricolage_Grotesque({
  subsets: ['latin'],
  display: 'swap',
  axes: ['opsz'],
  variable: '--font-display'
});

export const uiFont = Figtree({ subsets: ['latin'], display: 'swap', variable: '--font-ui' });

export const monoFont = JetBrains_Mono({ subsets: ['latin'], display: 'swap', variable: '--font-mono' });

/** Put on <html> so every font token resolves. */
export const fontVariables = `${displayFont.variable} ${uiFont.variable} ${monoFont.variable}`;
