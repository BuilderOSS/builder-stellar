import { describe, expect, it } from 'vitest';

import { largestBuyerShare } from './pool-share';

describe('largestBuyerShare', () => {
  it('assumes one wallet buys its whole limit and nobody else buys', () => {
    expect(largestBuyerShare(10n, '100', '5')).toEqual({ bought: 5, percent: 33.33 });
    expect(largestBuyerShare(0n, '3', '10')).toEqual({ bought: 3, percent: 100 });
  });
  it('waits for whole, positive numbers', () => {
    expect(largestBuyerShare(10n, '', '1')).toBeNull();
    expect(largestBuyerShare(10n, '5', '0')).toBeNull();
    expect(largestBuyerShare(10n, '2.5', '1')).toBeNull();
  });
});
