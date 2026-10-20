import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { MARKETPLACE_LOCAL_XLM_SAC } from '@/lib/marketplace/asset-label';
import type { MarketplaceCommunity, MarketplaceListing } from '@/lib/marketplace/types';

vi.mock('@/lib/marketplace/hooks', () => ({ useMarketplaceReadiness: () => ({}) }));
vi.mock('./listing-comments', () => ({ ListingComments: () => null }));
vi.mock('./trade-review', () => ({ TradeReview: () => null }));

import { ListingCard } from './listing-card';

vi.stubGlobal('React', React);
afterAll(() => vi.unstubAllGlobals());

const community: MarketplaceCommunity = {
  deploymentId: 'deployment',
  daoId: 'tribe',
  name: 'Test tribe',
  symbol: 'TEST',
  description: '',
  marketplaceContract: 'market',
  tokenContract: 'token',
  treasuryContract: 'treasury',
  status: 'launched',
  capabilities: ['marketplace']
};
const pool: MarketplaceListing = {
  deploymentId: 'deployment',
  daoId: 'tribe',
  contractId: 'market',
  eventId: 'pool-event',
  kind: 'pool',
  id: '1',
  tokenId: null,
  price: '10000000',
  paymentAsset: MARKETPLACE_LOCAL_XLM_SAC,
  feeBps: 0,
  seller: null,
  buyer: null,
  expiresAt: '9999999999',
  status: 'open',
  createdAt: null,
  closedAt: null,
  transactionHash: 'transaction',
  pool: { size: 5, sold: 3, stocked: 5, inStock: 2, maxPerBuyer: 1, maxSoldPerPeriod: 5, periodSecs: 3600 }
};

describe('pool availability on listing cards', () => {
  it('shows the remaining allocation for an open pool', () => {
    const html = renderToStaticMarkup(<ListingCard listing={pool} community={community} network="local" />);
    expect(html).toMatch(/2\s*<span>available<\/span>/);
  });

  it.each(['awaiting-expiry', 'closed', 'sold-out'] as const)(
    'does not advertise unsold tokens as available when %s',
    (status) => {
      const html = renderToStaticMarkup(
        <ListingCard listing={{ ...pool, status }} community={community} network="local" />
      );
      expect(html).not.toContain('available');
    }
  );
});
