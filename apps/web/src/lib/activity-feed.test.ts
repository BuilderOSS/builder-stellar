import { describe, expect, it } from 'vitest';

import { formatActivitySummary } from '@/lib/activity-feed';

function item(overrides: Partial<Parameters<typeof formatActivitySummary>[0]> = {}) {
  return {
    event_name: 'bid_placed',
    topics: '{}',
    args: '{}',
    token_id: null,
    amount: null,
    summary: 'Bid of unknown placed on token unknown',
    ...overrides
  };
}

describe('formatActivitySummary', () => {
  it('formats bid amounts from stroops and uses the indexed token id', () => {
    expect(formatActivitySummary(item({ event_name: 'BidPlaced', token_id: '33', amount: '1000000000' }))).toBe(
      'Bid of 100 placed on token 33'
    );
  });

  it('recovers token ids from event arguments', () => {
    expect(formatActivitySummary(item({ event_name: 'auction_created', args: JSON.stringify({ token_id: 33 }) }))).toBe(
      'Auction created for token 33'
    );
  });

  it('formats mint and seed activity without indexed unknown placeholders', () => {
    expect(
      formatActivitySummary(
        item({
          event_name: 'mint',
          args: JSON.stringify({ token_id: 33 }),
          topics: JSON.stringify({ to: 'GABC' })
        })
      )
    ).toBe('Minted token 33 to GABC');

    expect(formatActivitySummary(item({ event_name: 'seed_generated', token_id: '33' }))).toBe(
      'Seed generated for token 33'
    );
  });
});
