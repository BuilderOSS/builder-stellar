import { describe, expect, it } from 'vitest';

import { type AuctionSettings, buildAuctionChangePlan } from './auction-change-plan';

const current: AuctionSettings = { reservePrice: '10000000', duration: 86400, timeBuffer: 900, minBidIncrement: 10 };
const base = { live: true, paused: false, mode: 'proposal' as const, current, assetCode: 'XLM' };
const types = (steps: { type: string }[]) => steps.map((step) => step.type);

describe('buildAuctionChangePlan', () => {
  it('wraps changes to a running auction in pause and resume', () => {
    const steps = buildAuctionChangePlan({
      ...base,
      edits: { reservePrice: '5', duration: 172800 },
      after: 'resume'
    });
    expect(types(steps)).toEqual([
      'pause-auction',
      'set-auction-reserve-price',
      'set-auction-duration',
      'unpause-auction'
    ]);
    expect(steps[1].detail).toBe('1 XLM → 5 XLM');
    expect(steps[1].values).toEqual({ reservePrice: '5' });
  });

  it('leaves auctions paused when asked', () => {
    expect(types(buildAuctionChangePlan({ ...base, edits: { timeBuffer: 600 }, after: 'keep' }))).toEqual([
      'pause-auction',
      'set-auction-time-buffer'
    ]);
  });

  it('builds a pause-only or resume-only proposal with no setting changes', () => {
    expect(types(buildAuctionChangePlan({ ...base, edits: {}, after: 'keep' }))).toEqual(['pause-auction']);
    expect(types(buildAuctionChangePlan({ ...base, paused: true, edits: {}, after: 'resume' }))).toEqual([
      'unpause-auction'
    ]);
  });

  it('has nothing to do when nothing changes', () => {
    expect(buildAuctionChangePlan({ ...base, edits: {}, after: 'resume' })).toEqual([]);
    expect(buildAuctionChangePlan({ ...base, paused: true, edits: {}, after: 'keep' })).toEqual([]);
  });

  it('skips the pause when auctions are already paused', () => {
    expect(
      types(buildAuctionChangePlan({ ...base, paused: true, edits: { minBidIncrement: 5 }, after: 'resume' }))
    ).toEqual(['set-auction-min-bid-increment', 'unpause-auction']);
  });

  it('cancels right after pausing, before any setting changes', () => {
    expect(
      types(buildAuctionChangePlan({ ...base, edits: { reservePrice: '2' }, cancel: true, after: 'resume' }))
    ).toEqual(['pause-auction', 'cancel-auction', 'set-auction-reserve-price', 'unpause-auction']);
  });

  it('ignores values equal to the live ones, a blank price, and an unparsable price', () => {
    expect(
      buildAuctionChangePlan({
        ...base,
        paused: true,
        edits: { reservePrice: '1.0', duration: 86400, timeBuffer: 900, minBidIncrement: 10 },
        after: 'keep'
      })
    ).toEqual([]);
    expect(buildAuctionChangePlan({ ...base, paused: true, edits: { reservePrice: ' ' }, after: 'keep' })).toEqual([]);
    expect(buildAuctionChangePlan({ ...base, paused: true, edits: { reservePrice: 'abc' }, after: 'keep' })).toEqual(
      []
    );
  });

  it('applies settings directly during setup, with no pause or resume', () => {
    expect(
      types(
        buildAuctionChangePlan({
          ...base,
          live: false,
          mode: 'direct',
          edits: { duration: 3600 },
          cancel: true,
          after: 'resume'
        })
      )
    ).toEqual(['set-auction-duration']);
  });
});
