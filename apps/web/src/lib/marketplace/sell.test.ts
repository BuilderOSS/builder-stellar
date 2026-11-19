import { describe, expect, it } from 'vitest';

import {
  DEFAULT_LISTING_END,
  formatListingEnd,
  listedTokenIds,
  listingEndSeconds,
  type ListTerms,
  parseSellParam,
  PENDING_TIMEOUT_MS,
  pendingListing,
  resolveSellStep,
  sellHref,
  sellSequence,
  sellVoteWarning,
  unsettledChanges,
  withPendingChanges
} from './sell';
import type { MarketplaceListing } from './types';

const NOW = Date.UTC(2026, 10, 19, 12, 0, 0);
const terms: ListTerms = {
  action: 'list',
  tokenId: '7',
  price: '10',
  expiresAt: String(NOW / 1000 + 7 * 86_400),
  paymentAsset: 'C'.repeat(56),
  feeBps: 250
};
const indexed: MarketplaceListing = {
  ...pendingListing({
    terms,
    daoId: 'dao',
    deploymentId: 'dep',
    contractId: 'market',
    seller: 'G-seller',
    hash: 'hash-1',
    priceUnits: '100000000',
    nowMs: NOW
  }),
  eventId: 'event-1'
};

describe('Sell entry links', () => {
  it('opens the sell form on the tribe market, with a token when given', () => {
    expect(sellHref('lantern-club', 7)).toBe('/dao/lantern-club/marketplace?sell=7');
    expect(sellHref('lantern-club')).toBe('/dao/lantern-club/marketplace?sell=1');
    expect(sellHref('lantern-club', null)).toBe('/dao/lantern-club/marketplace?sell=1');
  });
  it('reads ?sell= as open, preselecting only a numeric token id', () => {
    expect(parseSellParam('7')).toEqual({ open: true, tokenId: '7' });
    expect(parseSellParam('1')).toEqual({ open: true, tokenId: '1' });
    expect(parseSellParam('yes')).toEqual({ open: true, tokenId: '' });
    expect(parseSellParam('')).toEqual({ open: false, tokenId: '' });
    expect(parseSellParam(undefined)).toEqual({ open: false, tokenId: '' });
  });
});

describe('listing end presets', () => {
  it('defaults to 7 days and offers 1, 7 and 30 days from now', () => {
    expect(DEFAULT_LISTING_END).toBe('7d');
    const now = NOW / 1000;
    expect(listingEndSeconds('1d', '', NOW)).toBe(now + 86_400);
    expect(listingEndSeconds('7d', '', NOW)).toBe(now + 7 * 86_400);
    expect(listingEndSeconds('30d', '', NOW)).toBe(now + 30 * 86_400);
  });
  it('takes a custom date only when it is in the future', () => {
    expect(listingEndSeconds('custom', '', NOW)).toBeNull();
    expect(listingEndSeconds('custom', 'not a date', NOW)).toBeNull();
    expect(listingEndSeconds('custom', '2020-01-01T10:00', NOW)).toBeNull();
    const future = listingEndSeconds('custom', '2030-03-03T10:00', NOW);
    expect(future).toBe(Math.floor(new Date('2030-03-03T10:00').getTime() / 1000));
  });
  it('shows the end as a readable date, not an ISO time', () => {
    const text = formatListingEnd(NOW / 1000 + 86_400, 'en-GB');
    expect(text).toContain('November 2026');
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });
});

describe('the guided sell sequence', () => {
  it('is Allow then List, with Cancel first when changing a price', () => {
    expect(sellSequence(terms).map((step) => step.kind)).toEqual(['approve', 'list']);
    expect(sellSequence(terms)[0]!.action).toEqual({ action: 'approve', tokenId: '7' });
    expect(sellSequence(terms)[0]!.why).toContain('about 1 hour');
    const change = sellSequence(terms, { action: 'cancel', kind: 'secondary', id: '7', eventId: 'event-1' });
    expect(change.map((step) => step.kind)).toEqual(['cancel', 'approve', 'list']);
  });
  it('skips Allow when the market already has a live permission', () => {
    const steps = sellSequence(terms);
    expect(resolveSellStep(steps, 0, true)).toEqual({ index: 1, skipped: true, expired: false });
    expect(resolveSellStep(steps, 0, false)).toEqual({ index: 0, skipped: false, expired: false });
  });
  it('sends List back to Allow when the permission ran out', () => {
    const steps = sellSequence(terms, { action: 'cancel', kind: 'secondary', id: '7', eventId: 'event-1' });
    expect(resolveSellStep(steps, 2, false)).toEqual({ index: 1, skipped: false, expired: true });
    expect(resolveSellStep(steps, 2, true)).toEqual({ index: 2, skipped: false, expired: false });
    expect(resolveSellStep(steps, 0, false)).toEqual({ index: 0, skipped: false, expired: false });
  });
});

describe('confirmed changes before the indexer catches up', () => {
  const listed = { type: 'listed' as const, listing: { ...indexed, eventId: 'pending:hash-1' }, at: NOW };
  it('shows a confirmed listing first and hides its token from the form', () => {
    expect(withPendingChanges([], [listed]).map((row) => row.eventId)).toEqual(['pending:hash-1']);
    expect(listedTokenIds([listed])).toEqual(new Set(['7']));
  });
  it('keeps a listing as updating until the indexer returns the same transaction', () => {
    expect(unsettledChanges([listed], [], NOW)).toHaveLength(1);
    expect(unsettledChanges([listed], [{ ...indexed, transactionHash: 'older' }], NOW)).toHaveLength(1);
    expect(unsettledChanges([listed], [indexed], NOW)).toHaveLength(0);
    // Never shown twice once both exist.
    expect(withPendingChanges([indexed], [listed]).map((row) => row.eventId)).toEqual(['event-1']);
  });
  it('hides a cancelled listing until the indexer no longer has it open', () => {
    const cancelled = { type: 'cancelled' as const, tokenId: '7', eventId: 'event-1', at: NOW };
    expect(withPendingChanges([indexed], [cancelled])).toEqual([]);
    expect(unsettledChanges([cancelled], [indexed], NOW)).toHaveLength(1);
    expect(unsettledChanges([cancelled], [{ ...indexed, status: 'cancelled' }], NOW)).toHaveLength(0);
    expect(unsettledChanges([cancelled], [], NOW)).toHaveLength(0);
  });
  it('stops waiting after a while', () => {
    expect(unsettledChanges([listed], [], NOW + PENDING_TIMEOUT_MS + 1)).toHaveLength(0);
  });
});

describe('the vote warning', () => {
  const base = { customVoteSource: false, tokenCount: 3n, delegated: false, membersOnlyDelegation: false };
  it('says the vote pauses while listed, and where it returns', () => {
    expect(sellVoteWarning(base)?.description).toContain('vote pauses');
    expect(sellVoteWarning(base)?.description).toContain('back to you');
    expect(sellVoteWarning({ ...base, delegated: true })?.description).toContain('back to your delegate');
  });
  it('warns about the last token and delegation membership', () => {
    const last = sellVoteWarning({ ...base, tokenCount: 1n, membersOnlyDelegation: true });
    expect(last?.title).toContain('last token');
    expect(last?.description).toContain("won't count as a member for delegation");
    expect(sellVoteWarning({ ...base, tokenCount: 1n })?.description).toContain("won't hold a vote");
  });
  it('says nothing when votes come from another source', () => {
    expect(sellVoteWarning({ ...base, customVoteSource: true })).toBeNull();
  });
  it('uses no em dashes', () => {
    for (const warning of [sellVoteWarning(base), sellVoteWarning({ ...base, tokenCount: 1n })])
      expect(`${warning?.title}${warning?.description}`).not.toContain('—');
  });
});
