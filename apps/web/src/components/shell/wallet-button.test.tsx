import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const wallet = vi.hoisted(() => ({
  isAuthenticated: true,
  isAuthBusy: false,
  address: 'GCLGEIQB4RCG63LSIBSHQ6T67YICWKTHSORNHVXHFVVGXISZU3MQU6CO',
  networkIssue: '',
  connect: vi.fn()
}));
vi.mock('./wallet-session', () => ({ useWalletSession: () => wallet }));

import { WalletButton } from './wallet-button';

// The existing Vitest config uses classic JSX, while Next uses the automatic runtime.
vi.stubGlobal('React', React);
afterAll(() => vi.unstubAllGlobals());

describe('WalletButton', () => {
  beforeEach(() => {
    wallet.isAuthenticated = true;
    wallet.networkIssue = '';
  });

  it('shows the short address beside the avatar and names the account for screen readers', () => {
    const html = renderToStaticMarkup(<WalletButton onOpenYou={vi.fn()} />);
    expect(html).toContain('GCLG…U6CO');
    expect(html).toContain('aria-label="You, connected as GCLG…U6CO"');
    expect(html).not.toContain(wallet.address);
  });

  it('mentions a wrong network in the label', () => {
    wallet.networkIssue = 'Switch your wallet to Testnet';
    const html = renderToStaticMarkup(<WalletButton onOpenYou={vi.fn()} />);
    expect(html).toContain('aria-label="You, connected as GCLG…U6CO, wallet on the wrong network"');
  });

  it('offers Connect when signed out', () => {
    wallet.isAuthenticated = false;
    const html = renderToStaticMarkup(<WalletButton onOpenYou={vi.fn()} />);
    expect(html).toContain('Connect');
    expect(html).not.toContain('GCLG');
  });
});
