import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DaoNetworkConfig } from '@/lib/dao-config';

const session = vi.hoisted(() => ({
  address: 'wallet',
  walletNetworkIssue: null as string | null,
  walletNetworkPassphrase: 'test'
}));
vi.mock('@/stores/auth-session-store', () => ({ useAuthSessionStore: () => session }));
vi.mock('@/lib/transaction-feedback', () => ({
  useTransactionFeedback: () => ({ start: vi.fn(), submitted: vi.fn(), success: vi.fn(), fail: vi.fn() })
}));
vi.mock('@/lib/use-admin-proposal-draft', () => ({
  useAdminProposalDraft: () => ({ pending: null, requestAdd: vi.fn(), cancel: vi.fn(), resolve: vi.fn() })
}));
vi.mock('@/components/admin/admin-proposal-draft-dialog', () => ({ AdminProposalDraftDialog: () => null }));

import { AuctionParameterControls } from './auction-parameter-controls';

const props = {
  daoId: 'dao',
  config: { name: 'testnet', passphrase: 'test' } as DaoNetworkConfig,
  paused: true,
  live: true,
  owner: false,
  canPropose: true,
  values: { duration: 300, timeBuffer: 30, increment: 10 },
  cancellable: true,
  busy: false,
  onBusyChange: vi.fn(),
  refresh: vi.fn()
};
function cancellationButton(html: string) {
  return html.match(/<button\b[^>]*>Review cancellation<\/button>/)?.[0] ?? '';
}
describe('auction lifecycle and authority controls', () => {
  beforeEach(() => {
    // This workspace's Vitest transform uses classic JSX; Next uses automatic JSX.
    vi.stubGlobal('React', React);
    session.walletNetworkIssue = null;
    session.walletNetworkPassphrase = 'test';
  });
  afterEach(() => vi.unstubAllGlobals());
  it('offers an explicit review step for cancellation of a paused live unsettled auction', () => {
    const html = renderToStaticMarkup(createElement(AuctionParameterControls, props));
    expect(cancellationButton(html)).not.toContain('disabled');
    expect(cancellationButton(html)).not.toBe('');
    expect(html).toContain('Minimum bid increment (%)');
    expect(html).toContain('id="auction-min-increment"');
    expect(html).toContain('for="auction-min-increment"');
  });
  it.each([{ paused: false }, { live: false }, { cancellable: false }, { canPropose: false }, { busy: true }])(
    'blocks cancellation with missing preconditions %s',
    (change) => {
      const html = renderToStaticMarkup(createElement(AuctionParameterControls, { ...props, ...change }));
      expect(cancellationButton(html)).toContain('disabled');
    }
  );
  it('disables editable fields when no live authority is available', () => {
    const html = renderToStaticMarkup(createElement(AuctionParameterControls, { ...props, canPropose: false }));
    expect(html.match(/<input[^>]*id="auction-min-increment"[^>]*>/)?.[0]).toContain('disabled');
  });
});
