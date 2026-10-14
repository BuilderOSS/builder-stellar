import { describe, expect, it } from 'vitest';

import {
  assertMarketplaceIdentity,
  buyableOfferWhere,
  listingStatus,
  marketplaceScope,
  matchesPoolSnapshot,
  matchesSnapshot,
  parseMarketplaceQuery
} from './query';
import type { MarketplaceCommunity, MarketplaceListing } from './types';

const community = {
  deploymentId: 'deployment-a',
  daoId: 'dao-a',
  marketplaceContract: 'market-a'
} as MarketplaceCommunity;
const listing = {
  deploymentId: 'deployment-a',
  daoId: 'dao-a',
  contractId: 'market-a',
  kind: 'secondary',
  id: '1',
  eventId: 'event-one',
  price: '10000001',
  paymentAsset: 'sac-a',
  expiresAt: '100',
  seller: 'seller',
  feeBps: 250
} as MarketplaceListing;

describe('marketplace identity and listing snapshots', () => {
  it('requires deployment, DAO and exact module identity, never a wallet-supplied fallback', () => {
    expect(marketplaceScope('deployment-a', 'dao-a', 'market-a')).toEqual({
      deploymentId: 'deployment-a',
      daoId: 'dao-a',
      contractId: 'market-a'
    });
    for (const args of [
      ['', 'dao-a', 'market-a'],
      ['deployment-a', '', 'market-a'],
      ['deployment-a', 'dao-a', '']
    ]) {
      expect(() => marketplaceScope(args[0], args[1], args[2])).toThrow();
    }
    expect(() => assertMarketplaceIdentity(listing, community)).not.toThrow();
    for (const change of [{ deploymentId: 'deployment-b' }, { daoId: 'dao-b' }, { contractId: 'market-b' }]) {
      expect(() => assertMarketplaceIdentity({ ...listing, ...change }, community)).toThrow();
    }
  });
  it('never presents time expiry as a completed escrow recovery', () => {
    expect(listingStatus('open', '100', 99)).toBe('open');
    expect(listingStatus('open', '100', 100)).toBe('awaiting-expiry');
    expect(listingStatus('purchased', '100', 101)).toBe('purchased');
    expect(() => listingStatus('invented', '100', 101)).toThrow();
  });
  it('counts as buyable only what is open, unexpired and, for a pool, in stock', () => {
    expect(buyableOfferWhere(100n)).toEqual({
      pool: { status: 'open', expiresAt: { gt: 100n }, inStock: { gt: 0 } },
      secondary: { status: 'open', expiresAt: { gt: 100n } }
    });
  });
  it('detects relisting, changed asset, price, fee, seller or expiry', () => {
    const live = { price: 10000001n, payment_asset: 'sac-a', expires_at: 100n, seller: 'seller', fee_bps: 250 };
    expect(matchesSnapshot(listing, live)).toBe(true);
    for (const drift of [
      { price: 10000002n },
      { payment_asset: 'sac-b' },
      { expires_at: 200n },
      { seller: 'other' },
      { fee_bps: 251 }
    ]) {
      expect(matchesSnapshot(listing, { ...live, ...drift })).toBe(false);
    }
    // A pool never matches a resale snapshot, and a pool snapshot pins its size and open state.
    expect(matchesSnapshot({ ...listing, kind: 'pool', seller: null, feeBps: 0 }, live)).toBe(false);
    const pool = {
      ...listing,
      kind: 'pool' as const,
      seller: null,
      feeBps: 0,
      pool: { size: 3, stocked: 0, sold: 0, inStock: 0, maxPerBuyer: 1, maxSoldPerPeriod: 1, periodSecs: 60 }
    };
    const livePool = { price: 10000001n, asset: 'sac-a', expires_at: 100n, size: 3, closed: false };
    expect(matchesPoolSnapshot(pool, livePool)).toBe(true);
    for (const drift of [{ price: 1n }, { asset: 'sac-b' }, { expires_at: 1n }, { size: 4 }, { closed: true }])
      expect(matchesPoolSnapshot(pool, { ...livePool, ...drift })).toBe(false);
  });
  it('validates truthful capabilities, type, status and bounded pagination', () => {
    expect(
      parseMarketplaceQuery(new URLSearchParams('kind=pool&status=all&capability=auction&page=2&search=DAO')).page
    ).toBe(2);
    for (const invalid of [
      'page=-1',
      'page=501',
      'kind=auction',
      'capability=art',
      'status=live',
      `search=${'a'.repeat(121)}`
    ]) {
      expect(() => parseMarketplaceQuery(new URLSearchParams(invalid))).toThrow();
    }
  });
});
