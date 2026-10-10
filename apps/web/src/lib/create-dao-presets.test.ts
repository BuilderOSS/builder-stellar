import { describe, expect, it } from 'vitest';

import { defaultConfiguration } from '@/stores/create-dao-store';

import { applyVotingPace, MEMBERSHIP_TYPES, membershipTypeOf, votingPaceOf, votingPaces } from './create-dao-presets';
import { sectionSchemas } from './create-dao-schema';

describe('membership types', () => {
  it('cover every auction and market combination exactly once', () => {
    for (const auction of [true, false])
      for (const marketplace of [true, false]) {
        const type = membershipTypeOf({ enabled: auction }, { enabled: marketplace });
        expect([type.auction, type.marketplace]).toEqual([auction, marketplace]);
      }
    expect(new Set(MEMBERSHIP_TYPES.map((type) => type.id)).size).toBe(4);
  });

  it('defaults to the recommended Daily auction', () => {
    const config = defaultConfiguration('testnet');
    expect(membershipTypeOf(config.auction, config.marketplace).id).toBe('auction');
  });
});

describe('voting paces', () => {
  it('offers Super fast on testnet only', () => {
    expect(votingPaces('testnet').map((pace) => pace.id)).toEqual(['super-fast', 'fast', 'balanced', 'deliberate']);
    expect(votingPaces('public').map((pace) => pace.id)).toEqual(['fast', 'balanced', 'deliberate']);
  });

  it('only contain values the create form accepts, and match themselves', () => {
    for (const pace of votingPaces('testnet')) {
      expect(sectionSchemas.governance.safeParse(pace.governance).success).toBe(true);
      expect(votingPaceOf(pace.governance, 'testnet')?.id).toBe(pace.id);
    }
  });

  it('defaults to Balanced and reports hand-edited values as custom', () => {
    const { governance } = defaultConfiguration('testnet');
    expect(votingPaceOf(governance, 'testnet')?.id).toBe('balanced');
    expect(votingPaceOf({ ...governance, quorumBps: 1234 }, 'testnet')).toBeNull();
  });

  it('Super fast speeds up auctions; leaving it restores them only when untouched', () => {
    const [superFast, , balanced] = votingPaces('testnet');
    expect(applyVotingPace(superFast, { duration: 86400, timeBuffer: 900 }).auction).toEqual({
      duration: 300,
      timeBuffer: 60
    });
    expect(applyVotingPace(balanced, { duration: 300, timeBuffer: 60 }).auction).toEqual({
      duration: 86400,
      timeBuffer: 900
    });
    expect(applyVotingPace(balanced, { duration: 7200, timeBuffer: 60 }).auction).toBeNull();
  });
});
