import { describe, expect, it } from 'vitest';

import { formatActivity, relativeTime, shortAddress } from '@/lib/activity-feed';

const ALICE = 'GCLGEIQB4RCG63LSIBSHQ6T67YICWKTHSORNHVXHFVVGXISZU3MQU6CO';
function item(overrides: Partial<Parameters<typeof formatActivity>[0]> = {}) {
  return {
    event_name: 'bid_placed',
    topics: '{}',
    args: '{}',
    token_id: null,
    amount: null,
    title: 'Bid placed',
    summary: 'Bid placed',
    proposal_id: null,
    ...overrides
  };
}

describe('activity feed rows', () => {
  it('writes bids as people and amounts, with a link to the auction', () => {
    expect(
      formatActivity(item({ token_id: '30', amount: '1200000000', topics: JSON.stringify({ bidder: ALICE }) }), 'dao')
    ).toEqual({ category: 'Auction', title: 'GCLG…U6CO bid 120 on #30', href: '/dao/dao/auctions' });
  });

  it('names the proposal and links votes to it', () => {
    const created = formatActivity(
      item({
        event_name: 'proposal_created',
        proposal_id: 'abc',
        topics: JSON.stringify({ proposer: ALICE }),
        args: JSON.stringify({ description: JSON.stringify({ title: 'Fund the art program' }) })
      }),
      'dao'
    );
    expect(created.title).toBe('New proposal: Fund the art program');
    expect(created.href).toBe('/dao/dao/proposals/abc');
    const vote = formatActivity(
      item({
        event_name: 'vote_cast',
        proposal_id: 'abc',
        topics: JSON.stringify({ voter: ALICE }),
        args: JSON.stringify({ vote_type: 1, weight: '10', reason: 'Yes' })
      }),
      'dao'
    );
    expect(vote).toMatchObject({ title: 'GCLG…U6CO voted For with 10 votes', detail: '“Yes”' });
  });

  it('quotes comments on proposals, bids and listings', () => {
    expect(
      formatActivity(
        item({
          event_name: 'proposal_commented',
          proposal_id: 'abc',
          topics: JSON.stringify({ proposal_id: 'abc', author: ALICE }),
          args: JSON.stringify({ body: 'Shipped the first batch' })
        }),
        'dao'
      )
    ).toEqual({
      category: 'Governance',
      title: 'GCLG…U6CO commented on a proposal',
      detail: '“Shipped the first batch”',
      href: '/dao/dao/proposals/abc'
    });
    expect(
      formatActivity(
        item({
          token_id: '30',
          amount: '1200000000',
          topics: JSON.stringify({ bidder: ALICE }),
          args: JSON.stringify({ comment: 'gm' })
        })
      ).detail
    ).toBe('“gm”');
    expect(
      formatActivity(
        item({ event_name: 'listing_commented', token_id: '7', topics: JSON.stringify({ author: ALICE }) })
      ).title
    ).toBe('GCLG…U6CO commented on #7');
    expect(
      formatActivity(
        item({ event_name: 'primary_listing_commented', topics: JSON.stringify({ listing_id: 2, author: ALICE }) })
      ).title
    ).toBe('GCLG…U6CO commented on new token listing 2');
  });

  it('summarises an allocation once instead of a row per token', () => {
    expect(
      formatActivity(
        item({ event_name: 'mint_batch_with_minter', args: JSON.stringify({ count: 30, first_token_id: 0 }) })
      )
    ).toMatchObject({ category: 'Membership', title: '30 tokens allocated', detail: 'Tokens #0–#29' });
  });

  it('explains an unsold auction', () => {
    expect(formatActivity(item({ event_name: 'auction_settled', token_id: '9' })).title).toBe(
      '#9 closed with no bids; it went to the treasury'
    );
  });

  it('shortens addresses and formats relative time', () => {
    expect(shortAddress(ALICE)).toBe('GCLG…U6CO');
    const now = Date.parse('2026-10-10T12:00:00Z');
    expect(relativeTime(Math.floor(now / 1000) - 30, now)).toBe('just now');
    expect(relativeTime(Math.floor(now / 1000) - 720, now)).toBe('12m ago');
    expect(relativeTime(Math.floor(now / 1000) - 3 * 3600, now)).toBe('3h ago');
  });
});
