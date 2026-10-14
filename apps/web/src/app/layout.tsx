import '../../styled-system/styles.css';
import './globals.css';

import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Figtree, JetBrains_Mono } from 'next/font/google';
import type { ReactNode } from 'react';

import { AgentationDevToolbar } from '@/components/agentation-dev-toolbar';
import { AppToaster } from '@/components/app-toaster';
import { GlobalShell } from '@/components/shell/app-shell';
import { WalletSessionProvider } from '@/components/shell/wallet-session';
import { WarmInkThemeRuntime } from '@/components/warm-ink-theme';
import { SITE_DESCRIPTION, SITE_NAME, siteUrl } from '@/lib/site';
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
  metadataBase: siteUrl(),
  title: { default: SITE_NAME, template: `%s · ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: {
    title: SITE_NAME,
    description: 'Your people. Your rules. Your treasury.',
    siteName: SITE_NAME,
    type: 'website'
  }
};

export const viewport: Viewport = {
  // Browser chrome can't read CSS variables; these mirror colors.canvas.
  /* eslint-disable no-restricted-syntax */
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#141311' },
    { media: '(prefers-color-scheme: light)', color: '#F3EFE8' }
  ],
  /* eslint-enable no-restricted-syntax */
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
        <AgentationDevToolbar />
      </body>
    </html>
  );
}
