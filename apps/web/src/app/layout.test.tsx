import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestHeaders = vi.hoisted(() => ({ value: new Headers() }));
const passthrough = vi.hoisted(
  () =>
    ({ children }: { children?: unknown }) =>
      children
);
vi.mock('next/headers', () => ({ headers: async () => requestHeaders.value }));
vi.mock('@builder-stellar/design-tokens/fonts', () => ({ fontVariables: 'fonts' }));
vi.mock('@/components/shell/app-shell', () => ({ GlobalShell: passthrough }));
vi.mock('@/components/shell/wallet-session', () => ({ WalletSessionProvider: passthrough }));
vi.mock('@/components/warm-ink-theme', () => ({ WarmInkThemeRuntime: () => null }));
vi.mock('@/components/app-toaster', () => ({ AppToaster: () => null }));
vi.mock('@/components/agentation-dev-toolbar', () => ({ AgentationDevToolbar: () => null }));

import RootLayout from './layout';

describe('RootLayout', () => {
  beforeEach(() => vi.stubGlobal('React', React));

  it("puts the request's CSP nonce on the theme boot script", async () => {
    requestHeaders.value = new Headers({ 'x-nonce': 'bm9uY2Utb25lLXR3bw==' });
    const html = renderToStaticMarkup(await RootLayout({ children: <p>page</p> }));
    expect(html).toMatch(/<script nonce="bm9uY2Utb25lLXR3bw==">\(\(\)=>/);
    expect(html).toContain('<p>page</p>');
  });

  it('renders without a nonce when the middleware did not run', async () => {
    requestHeaders.value = new Headers();
    expect(renderToStaticMarkup(await RootLayout({ children: null }))).not.toContain('nonce=');
  });
});
