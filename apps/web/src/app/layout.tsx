import '../../styled-system/styles.css';
import './globals.css';

import { fontVariables } from '@builder-stellar/design-tokens/fonts';
import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';

import { AgentationDevToolbar } from '@/components/agentation-dev-toolbar';
import { AppToaster } from '@/components/app-toaster';
import { GlobalShell } from '@/components/shell/app-shell';
import { WalletSessionProvider } from '@/components/shell/wallet-session';
import { WarmInkThemeRuntime } from '@/components/warm-ink-theme';
import { SITE_DESCRIPTION, SITE_NAME, siteUrl } from '@/lib/site';
import { warmInkBootScript } from '@/lib/warm-ink-theme';

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: { default: SITE_NAME, template: `%s · ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: {
    title: SITE_NAME,
    description: 'Build a tribe on Stellar. Members share a treasury and vote on decisions together.',
    siteName: SITE_NAME,
    type: 'website'
  },
  // X reads og:image and og:title; this asks for the large card.
  twitter: { card: 'summary_large_image' }
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

export default async function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  // The Content-Security-Policy nonce (src/middleware.ts). Reading it renders every page per request.
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    <html lang="en" className={fontVariables} data-theme="dark" suppressHydrationWarning>
      <head>
        <meta name="color-scheme" content="dark light" />
        {/* Browsers hide a nonce attribute once the page loads, so the client sees nonce="". */}
        <script nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: warmInkBootScript }} />
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
