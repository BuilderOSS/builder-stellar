import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { MARKETPLACE_LOCAL_XLM_SAC } from '@/lib/marketplace/asset-label';
import type { DaoMarketplace } from '@/lib/marketplace/types';

const MEMBER = `G${'M'.repeat(55)}`;
const state = vi.hoisted(() => ({
  auth: 'authenticated',
  networkIssue: '',
  tokenCount: 2n,
  delegatedTo: '' as string,
  tokens: ['3', '7'] as string[]
}));

vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: (select?: (s: unknown) => unknown) => {
    const session = { authStatus: state.auth, address: MEMBER, walletNetworkIssue: state.networkIssue };
    return select ? select(session) : session;
  }
}));
vi.mock('@/components/shell/wallet-session', () => ({
  useWalletSession: () => ({ connect: vi.fn(), isAuthBusy: false })
}));
vi.mock('@/contexts/dao-context', () => ({
  useDaoContext: () => ({ daoConfig: { tokenSettings: { membersOnlyDelegation: true } } })
}));
vi.mock('@/hooks/use-dao-membership', () => ({
  useDaoMembership: () => ({
    customVoteSource: false,
    tokenCount: state.tokenCount,
    member: { address: MEMBER, delegated_to: state.delegatedTo || MEMBER }
  })
}));
vi.mock('@/lib/marketplace/hooks', () => ({
  useMarketplaceInventory: () => ({
    data: state.auth === 'authenticated' ? { tokenIds: state.tokens, hasMore: false } : undefined
  }),
  useMarketplaceReadiness: () => ({})
}));
vi.mock('./sell-sequence', () => ({ SellSequence: () => null }));
vi.mock('./trade-review', () => ({ TradeReview: () => null }));

vi.stubGlobal('React', React);
afterAll(() => vi.unstubAllGlobals());
const { SellForm, sellTerms } = await import('./sell-form');

const data = {
  network: 'local',
  launched: true,
  community: { daoId: 'dao', marketplaceContract: 'market' },
  config: { paymentAsset: MARKETPLACE_LOCAL_XLM_SAC, feeBps: 250, paused: false }
} as unknown as DaoMarketplace;

describe('the sell form', () => {
  beforeEach(() => {
    state.auth = 'authenticated';
    state.networkIssue = '';
    state.tokenCount = 2n;
    state.delegatedTo = '';
    state.tokens = ['3', '7'];
  });

  it('shows one List for sale button, the 7-day default and the presets', () => {
    const html = renderToStaticMarkup(<SellForm data={data} />);
    expect(html).toContain('List for sale');
    expect(html).not.toContain('1. Allow the market');
    expect(html).not.toContain('2. List it');
    for (const label of ['1 day', '7 days', '30 days', 'Custom']) expect(html).toContain(label);
    expect(html).toContain('Resale fee');
    expect(html).not.toContain('10 minutes');
  });

  it('offers Connect when signed out, before the form', () => {
    state.auth = 'unauthenticated';
    const html = renderToStaticMarkup(<SellForm data={data} />);
    expect(html).toContain('Connect wallet');
  });

  it('shows the network warning before the form on the wrong network', () => {
    state.networkIssue = 'Switch your wallet to Testnet.';
    const html = renderToStaticMarkup(<SellForm data={data} />);
    expect(html).toContain('Switch your wallet to Testnet.');
  });

  it('preselects the token from a Sell link and warns that its vote pauses', () => {
    const html = renderToStaticMarkup(<SellForm data={data} initialTokenId="7" />);
    expect(html).toMatch(/<option value="7" selected="">Token #7<\/option>/);
    expect(html).toContain('vote pauses');
  });

  it('warns about the last token and membership for delegation', () => {
    state.tokenCount = 1n;
    state.tokens = ['7'];
    const html = renderToStaticMarkup(<SellForm data={data} initialTokenId="7" />);
    expect(html).toContain('This is your last token in this tribe');
    expect(html).toContain('count as a member for delegation');
  });

  it('hides a token just listed from the choice', () => {
    const html = renderToStaticMarkup(<SellForm data={data} hiddenTokenIds={new Set(['7'])} initialTokenId="7" />);
    expect(html).not.toContain('Token #7');
    expect(html).toContain('Token #3');
  });
});

describe('sellTerms', () => {
  const config = { paymentAsset: MARKETPLACE_LOCAL_XLM_SAC, feeBps: 250 };
  const now = Date.UTC(2026, 10, 19);
  it('needs a token, a price and a future end', () => {
    expect(sellTerms({ tokenId: '', price: '10', preset: '7d', custom: '' }, config, now)).toBe(
      'Choose one of your tokens.'
    );
    expect(typeof sellTerms({ tokenId: '7', price: '', preset: '7d', custom: '' }, config, now)).toBe('string');
    expect(sellTerms({ tokenId: '7', price: '10', preset: 'custom', custom: '' }, config, now)).toContain('ends');
  });
  it('builds the List terms with the default 7-day end', () => {
    expect(sellTerms({ tokenId: '7', price: '10', preset: '7d', custom: '' }, config, now)).toEqual({
      action: 'list',
      tokenId: '7',
      price: '10',
      expiresAt: String(now / 1000 + 7 * 86_400),
      paymentAsset: MARKETPLACE_LOCAL_XLM_SAC,
      feeBps: 250
    });
  });
});
