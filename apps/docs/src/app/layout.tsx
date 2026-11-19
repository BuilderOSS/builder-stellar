import '../../styled-system/styles.css';
import './globals.css';

import { fontVariables } from '@builder-stellar/design-tokens/fonts';
import { themeBootScript } from '@builder-stellar/design-tokens/theme';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { css } from 'styled-system/css';

import { SiteHeader } from '@/components/site-header';
import { ThemeRuntime } from '@/components/theme';
import { DOCS_DEFAULT_THEME, DOCS_DESCRIPTION, DOCS_NAME, DOCS_URL } from '@/lib/site';

export const metadata: Metadata = {
  metadataBase: DOCS_URL,
  title: { default: DOCS_NAME, template: `%s · ${DOCS_NAME}` },
  description: DOCS_DESCRIPTION,
  applicationName: DOCS_NAME,
  openGraph: { title: DOCS_NAME, description: DOCS_DESCRIPTION, siteName: DOCS_NAME, type: 'website' }
};

export const viewport: Viewport = {
  // Browser chrome can't read CSS variables; these mirror colors.canvas (as in apps/web).
  /* eslint-disable no-restricted-syntax */
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#141311' },
    { media: '(prefers-color-scheme: light)', color: '#F3EFE8' }
  ],
  /* eslint-enable no-restricted-syntax */
  viewportFit: 'cover'
};

const skipLink = css({
  position: 'absolute',
  left: '4',
  top: '3',
  zIndex: 'toast',
  px: '4',
  minH: 'touch',
  display: 'inline-flex',
  alignItems: 'center',
  borderRadius: 'control',
  bg: 'primary',
  color: 'primary.fg',
  textStyle: 'label',
  textDecoration: 'none',
  translate: '0 -200%',
  _focusVisible: { translate: '0 0' }
});

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en-GB" className={fontVariables} data-theme="dark" suppressHydrationWarning>
      <head>
        <meta name="color-scheme" content="dark light" />
        <script dangerouslySetInnerHTML={{ __html: themeBootScript(DOCS_DEFAULT_THEME) }} />
      </head>
      <body>
        <a href="#content" className={skipLink}>
          Skip to content
        </a>
        <SiteHeader />
        {children}
        <ThemeRuntime />
      </body>
    </html>
  );
}
