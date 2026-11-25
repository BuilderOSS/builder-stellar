import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { MARKETPLACE_LOCAL_XLM_SAC } from '@/lib/marketplace/asset-label';
import { formatListingEnd } from '@/lib/marketplace/sell';
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

describe('a listing waiting for the indexer', () => {
  it('is marked as updating and offers no actions', () => {
    const resale = {
      ...pool,
      kind: 'secondary' as const,
      id: '7',
      tokenId: '7',
      pool: undefined,
      eventId: 'pending:hash'
    };
    const html = renderToStaticMarkup(<ListingCard listing={resale} community={community} network="local" trading />);
    expect(html).toContain('updating');
    expect(html).not.toContain('Details');
  });
});

describe('a listing end a Date cannot hold', () => {
  // The market takes any future u64 as an end; u64::MAX has no date, so the card says so.
  const U64_MAX = '18446744073709551615';
  const resale: MarketplaceListing = {
    ...pool,
    kind: 'secondary',
    id: '7',
    tokenId: '7',
    pool: undefined,
    seller: 'GSELLER',
    eventId: 'resale-event'
  };
  const details = (listing: MarketplaceListing) =>
    renderToStaticMarkup(<ListingCard listing={listing} community={community} network="local" initiallyExpanded />);

  it('shows "No closing date" for a pool', () => {
    const html = details({ ...pool, expiresAt: U64_MAX });
    expect(html).toContain('<dt>Closes</dt><dd>No closing date</dd>');
    expect(html).not.toContain('Invalid Date');
  });

  it('shows "No end date" for a resale', () => {
    const html = details({ ...resale, expiresAt: U64_MAX });
    expect(html).toContain('<dt>Ends</dt><dd>No end date</dd>');
    expect(html).not.toContain('Invalid Date');
  });

  it('shows the date for an end a Date can hold', () => {
    const html = details({ ...resale, expiresAt: '1800000000' });
    expect(html).toContain('<dt>Ends</dt><dd>' + formatListingEnd('1800000000') + '</dd>');
  });
});
