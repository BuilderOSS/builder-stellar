import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { MARKETPLACE_LOCAL_XLM_SAC } from '@/lib/marketplace/asset-label';
import type { MarketplaceListing } from '@/lib/marketplace/types';

vi.mock('./sell-sequence', () => ({ SellSequence: () => null }));
vi.mock('./trade-review', () => ({ TradeReview: () => null }));
vi.stubGlobal('React', React);
afterAll(() => vi.unstubAllGlobals());
const { CHANGE_PRICE_INTRO, YourListings, yourListingState } = await import('./your-listings');

const open: MarketplaceListing = {
  deploymentId: 'dep',
  daoId: 'dao',
  contractId: 'market',
  eventId: 'event-7',
  kind: 'secondary',
  id: '7',
  tokenId: '7',
  price: '100000000',
  paymentAsset: MARKETPLACE_LOCAL_XLM_SAC,
  feeBps: 250,
  seller: 'G-me',
  buyer: null,
  expiresAt: '9999999999',
  status: 'open',
  createdAt: null,
  closedAt: null,
  transactionHash: 'hash'
};
const props = {
  network: 'local' as const,
  config: { paymentAsset: MARKETPLACE_LOCAL_XLM_SAC, feeBps: 250, paused: false, treasury: 't', token: 'k' },
  purchasesEnabled: true,
  onCancelled: () => {},
  onListed: () => {}
};

describe('Your listings', () => {
  it('lists your open resale with Change price and Cancel', () => {
    const html = renderToStaticMarkup(<YourListings listings={[open]} {...props} />);
    expect(html).toContain('Your listings');
    expect(html).toContain('Change price');
    expect(html).toContain('Cancel listing');
    expect(html).not.toContain('Return my token');
  });
  it('makes an ended listing that still holds your token obvious, with Return my token', () => {
    const html = renderToStaticMarkup(<YourListings listings={[{ ...open, status: 'awaiting-expiry' }]} {...props} />);
    expect(html).toContain('Your listing of token #7 has ended');
    expect(html).toContain('Return my token');
    expect(html).not.toContain('Change price');
  });
  it('marks a confirmed listing as updating, with no actions yet', () => {
    const html = renderToStaticMarkup(<YourListings listings={[{ ...open, eventId: 'pending:hash' }]} {...props} />);
    expect(html).toContain('Updating');
    expect(html).not.toContain('Cancel listing');
    expect(yourListingState({ ...open, eventId: 'pending:hash' }).label).toBe('Updating');
  });
  it('shows nothing when you have no listings', () => {
    expect(renderToStaticMarkup(<YourListings listings={[]} {...props} />)).toBe('');
  });
  it('explains that a new price takes two or three signatures', () => {
    expect(CHANGE_PRICE_INTRO).toContain('two or three signatures');
  });
});
