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

  it('names the payment asset when the feed knows it', () => {
    const testnetXlm = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
    expect(
      formatActivity(
        item({
          token_id: '31',
          amount: '100000000',
          topics: JSON.stringify({ bidder: ALICE }),
          payment_asset: testnetXlm
        }),
        'dao'
      ).title
    ).toBe('GCLG…U6CO bid 10 XLM on #31');
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

  it('names the module in an upgrade and says what a notice change means', () => {
    expect(
      formatActivity(
        item({ event_name: 'upgraded', title: 'Auction upgraded', args: JSON.stringify({ version: '0.3.0' }) })
      ).title
    ).toBe('Auction upgraded to version 0.3.0');
    expect(
      formatActivity(
        item({
          event_name: 'upgrade_delay_changed',
          title: 'Minter upgrade notice changed',
          args: JSON.stringify({ from_ledgers: 120960, to_ledgers: 17280, effective_ledger: 5000 })
        })
      )
    ).toMatchObject({
      category: 'DAO',
      title: 'Minter upgrade notice changed',
      detail: 'Shortened from 7d to 1d (120960 → 17280 ledgers), in force from ledger 5000'
    });
  });

  it('writes renames, link changes, claim rounds and profile updates as sentences', () => {
    expect(
      formatActivity(
        item({ event_name: 'metadata_updated', args: JSON.stringify({ name: 'Lantern Club', symbol: 'LC' }) })
      ).title
    ).toBe('Renamed to Lantern Club (LC)');
    expect(
      formatActivity(
        item({
          event_name: 'slug_changed',
          topics: JSON.stringify({ new_slug: 'alpha-club' }),
          args: JSON.stringify({ old_slug: 'dao-uno' })
        }),
        'dao-uno'
      )
    ).toMatchObject({
      title: 'Community link is now /dao/alpha-club',
      detail: 'Was /dao/dao-uno',
      href: '/dao/alpha-club'
    });
    expect(
      formatActivity(item({ event_name: 'merkle_root_set_event', topics: JSON.stringify({ round: 2 }) }), 'alpha-club')
    ).toMatchObject({
      category: 'Membership',
      title: 'Claim round 2 opened',
      href: '/dao/alpha-club/claims'
    });
    expect(formatActivity(item({ event_name: 'profile_updated', args: JSON.stringify({ seq: 3 }) })).title).toBe(
      'Community profile updated'
    );
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
