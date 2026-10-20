import { describe, expect, it } from 'vitest';

import { ACTION_SOURCES } from '@/lib/proposal-actions/action-request';
import { config } from '@/lib/proposal-actions/test-fixtures';
import { getProposalActionSummary } from '@/lib/proposal-call';

import { auctionActionRequest, type AuctionSettings, buildAuctionActionPlan } from './auction-action-plan';

const current: AuctionSettings = { reservePrice: '10000000', duration: 86400, timeBuffer: 900, minBidIncrement: 10 };
const base = { live: true, paused: false, mode: 'proposal' as const, current, assetCode: 'XLM' };
const types = (steps: { type: string }[]) => steps.map((step) => step.type);

describe('buildAuctionActionPlan', () => {
  it('wraps changes to a running auction in pause and resume', () => {
    const steps = buildAuctionActionPlan({
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
    expect(steps[1].values).toEqual({ reservePrice: '5', assetCode: 'XLM' });
  });

  it('leaves auctions paused when asked', () => {
    expect(types(buildAuctionActionPlan({ ...base, edits: { timeBuffer: 600 }, after: 'keep' }))).toEqual([
      'pause-auction',
      'set-auction-time-buffer'
    ]);
  });

  it('builds a pause-only or resume-only proposal with no setting changes', () => {
    expect(types(buildAuctionActionPlan({ ...base, edits: {}, after: 'keep' }))).toEqual(['pause-auction']);
    expect(types(buildAuctionActionPlan({ ...base, paused: true, edits: {}, after: 'resume' }))).toEqual([
      'unpause-auction'
    ]);
  });

  it('has nothing to do when nothing changes', () => {
    expect(buildAuctionActionPlan({ ...base, edits: {}, after: 'resume' })).toEqual([]);
    expect(buildAuctionActionPlan({ ...base, paused: true, edits: {}, after: 'keep' })).toEqual([]);
  });

  it('skips the pause when auctions are already paused', () => {
    expect(
      types(buildAuctionActionPlan({ ...base, paused: true, edits: { minBidIncrement: 5 }, after: 'resume' }))
    ).toEqual(['set-auction-min-bid-increment', 'unpause-auction']);
  });

  it('cancels right after pausing, before any setting changes', () => {
    expect(
      types(buildAuctionActionPlan({ ...base, edits: { reservePrice: '2' }, cancel: true, after: 'resume' }))
    ).toEqual(['pause-auction', 'cancel-auction', 'set-auction-reserve-price', 'unpause-auction']);
  });

  it('ignores values equal to the live ones, a blank price, and an unparsable price', () => {
    expect(
      buildAuctionActionPlan({
        ...base,
        paused: true,
        edits: { reservePrice: '1.0', duration: 86400, timeBuffer: 900, minBidIncrement: 10 },
        after: 'keep'
      })
    ).toEqual([]);
    expect(buildAuctionActionPlan({ ...base, paused: true, edits: { reservePrice: ' ' }, after: 'keep' })).toEqual([]);
    expect(buildAuctionActionPlan({ ...base, paused: true, edits: { reservePrice: 'abc' }, after: 'keep' })).toEqual(
      []
    );
  });

  it('applies settings directly during setup, with no pause or resume', () => {
    expect(
      types(
        buildAuctionActionPlan({
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

describe('auctionActionRequest', () => {
  it('adds the whole plan as one "Change the auction" item from Manage → Auction', () => {
    const steps = buildAuctionActionPlan({ ...base, edits: { reservePrice: '5' }, after: 'resume' });
    const request = auctionActionRequest(steps, config, null, ['old']);
    expect(types(request.actions)).toEqual(['pause-auction', 'set-auction-reserve-price', 'unpause-auction']);
    expect(request.bundle?.label).toBe('Change the auction: 3 steps');
    expect(request.source).toEqual(ACTION_SOURCES.auction);
    expect(request.note).toBe('Pause auctions. Change the starting price: 1 XLM → 5 XLM. Resume auctions.');
    expect(request.replaces).toEqual(['old']);
    expect(request.actions[1]).toMatchObject({ reservePrice: '5', assetCode: 'XLM' });
    expect(getProposalActionSummary(request.actions[1])).toBe('Change the starting price to 5 XLM');
  });
});
