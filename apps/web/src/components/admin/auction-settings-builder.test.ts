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
  useAdminProposalDraft: () => ({ pending: null, requestAddBatch: vi.fn(), cancel: vi.fn(), resolve: vi.fn() })
}));
vi.mock('@/components/admin/admin-proposal-draft-dialog', () => ({ AdminProposalDraftDialog: () => null }));

import { AuctionSettingsBuilder } from './auction-settings-builder';

const props = {
  daoId: 'dao',
  config: { name: 'testnet', passphrase: 'test' } as DaoNetworkConfig,
  live: true,
  paused: false,
  current: { reservePrice: '10000000', duration: 86400, timeBuffer: 900, minBidIncrement: 10 },
  assetCode: 'XLM',
  currentTokenId: '12',
  cancellable: true,
  direct: false,
  canPropose: true,
  busy: false,
  onBusyChange: vi.fn(),
  refresh: vi.fn()
};
const render = (change: Partial<typeof props> = {}) =>
  renderToStaticMarkup(createElement(AuctionSettingsBuilder, { ...props, ...change }));
const input = (html: string, id: string) => html.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`))?.[0] ?? '';

describe('auction settings builder', () => {
  beforeEach(() => {
    // This workspace's Vitest transform uses classic JSX; Next uses automatic JSX.
    vi.stubGlobal('React', React);
    session.walletNetworkIssue = null;
  });
  afterEach(() => vi.unstubAllGlobals());

  it('lets members edit settings while auctions are running', () => {
    const html = render();
    expect(input(html, 'auction-min-increment')).not.toContain('disabled');
    expect(input(html, 'auction-reserve-price')).not.toContain('disabled');
    expect(html).toContain('for="auction-min-increment"');
    expect(html).toContain('Minimum bid increase (%)');
  });

  it('offers resume or keep paused once launched, and cancelling only when there is a live auction', () => {
    const html = render();
    expect(html).toContain('Resume auctions');
    expect(html).toContain('Keep auctions paused');
    expect(html).toContain('Also cancel the current auction');
    expect(render({ cancellable: false })).not.toContain('Also cancel the current auction');
  });

  it('applies directly during setup, without pause, resume or cancel', () => {
    const html = render({ live: false, direct: true, canPropose: false, paused: true });
    expect(html).not.toContain('Keep auctions paused');
    expect(html).not.toContain('Also cancel the current auction');
    expect(html).toContain('changes apply right away');
  });

  it('disables every field without authority', () => {
    const html = render({ canPropose: false });
    expect(input(html, 'auction-min-increment')).toContain('disabled');
    expect(input(html, 'auction-reserve-price')).toContain('disabled');
  });
});
