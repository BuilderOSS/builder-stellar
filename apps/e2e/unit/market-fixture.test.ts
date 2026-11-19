import { describe, expect, it } from 'vitest';

import { loadMarketFixture, xlmStroops } from '../src/market-fixture.ts';

describe('the W10 market fixture', () => {
  it('reads the committed config and deploy artifact', () => {
    const market = loadMarketFixture();
    expect(market.slug).toBe('e2e-market');
    expect(market.daoId).toMatch(/^C[A-Z2-7]{55}$/);
    expect(market.marketplace).toMatch(/^C[A-Z2-7]{55}$/);
    expect(market.feeBps).toBe(250);
    expect(market.sellerTokens).toEqual([3, 4]);
  });

  it('converts XLM to stroops exactly', () => {
    expect(xlmStroops('6')).toBe(60_000_000n);
    expect(xlmStroops('4.875')).toBe(48_750_000n);
    expect(xlmStroops('0.0000001')).toBe(1n);
  });
});
