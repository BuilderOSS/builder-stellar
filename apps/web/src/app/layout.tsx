import '../../styled-system/styles.css';
import './globals.css';

import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Figtree, JetBrains_Mono } from 'next/font/google';
import type { ReactNode } from 'react';

import { AppToaster } from '@/components/app-toaster';
import { GlobalShell } from '@/components/shell/app-shell';
import { WalletSessionProvider } from '@/components/shell/wallet-session';
import { WarmInkThemeRuntime } from '@/components/warm-ink-theme';
import { warmInkBootScript } from '@/lib/warm-ink-theme';

// Fetched by Next at build time and self-hosted; no runtime font CDN.
const display = Bricolage_Grotesque({
  subsets: ['latin'],
  display: 'swap',
  axes: ['opsz'],
  variable: '--font-display'
});
const ui = Figtree({ subsets: ['latin'], display: 'swap', variable: '--font-ui' });
const mono = JetBrains_Mono({ subsets: ['latin'], display: 'swap', variable: '--font-mono' });

export const metadata: Metadata = {
  title: { default: 'Builder', template: '%s · Builder' },
  description: 'Start a community with your people, vote on what happens next, and see where the shared treasury goes.',
  applicationName: 'Builder',
  openGraph: {
    title: 'Builder',
    description: 'Your community. Your rules. Your treasury.',
    siteName: 'Builder',
    type: 'website'
  }
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#15120F' },
    { media: '(prefers-color-scheme: light)', color: '#F3EFE8' }
  ],
  viewportFit: 'cover'
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${ui.variable} ${mono.variable}`}
      data-theme="dark"
      suppressHydrationWarning
    >
      <head>
        <meta name="color-scheme" content="dark light" />
        <script dangerouslySetInnerHTML={{ __html: warmInkBootScript }} />
      </head>
      <body>
        <WalletSessionProvider>
          <GlobalShell>{children}</GlobalShell>
        </WalletSessionProvider>
        <WarmInkThemeRuntime />
        <AppToaster />
      </body>
    </html>
  );
}
