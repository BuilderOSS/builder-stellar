import '../../styled-system/styles.css';
import './globals.css';

import type { Metadata } from 'next';
import { Instrument_Serif, Inter } from 'next/font/google';
import type { ReactNode } from 'react';

import { AppToaster } from '@/components/app-toaster';
import { WarmInkThemeRuntime } from '@/components/warm-ink-theme';
import { warmInkBootScript } from '@/lib/warm-ink-theme';

const instrument = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-instrument'
});
// Pretendard requires an approved local asset or dependency. Inter is fetched
// by Next at build time and self-hosted, not a runtime CDN or a named fallback.
const interfaceFont = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-ui' });
const daoConfig = { tokenName: 'DAO', tokenDescription: 'Stellar DAO' };

export const metadata: Metadata = {
  title: daoConfig.tokenName,
  description: daoConfig.tokenDescription
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${instrument.variable} ${interfaceFont.variable}`}
      data-palette="c"
      suppressHydrationWarning
    >
      <head>
        <meta name="color-scheme" content="light dark" />
        <script dangerouslySetInnerHTML={{ __html: warmInkBootScript }} />
      </head>
      <body>
        {children}
        <WarmInkThemeRuntime />
        <AppToaster />
      </body>
    </html>
  );
}
