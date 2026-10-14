import { describe, expect, it } from 'vitest';

import {
  feeBpsFromPercent,
  feePercentText,
  formatMarketplaceAmount,
  marketplaceFee,
  marketplaceId,
  MAX_I128,
  parseMarketplaceAmount
} from './amount';

describe('marketplace exact SAC amounts', () => {
  it('round-trips seven places without a Number conversion', () => {
    for (const value of ['0.0000001', '1.0000000', '1234567890123456789.1234567']) {
      expect(formatMarketplaceAmount(parseMarketplaceAmount(value))).toBe(value);
    }
    expect(parseMarketplaceAmount('10.05')).toBe(100_500_000n);
    expect(parseMarketplaceAmount('0', true)).toBe(0n);
    expect(parseMarketplaceAmount(formatMarketplaceAmount(MAX_I128))).toBe(MAX_I128);
  });
  it.each(['0', '-1', '1e3', '.1', '1.', '01', '1.00000001', 'NaN', '1,000', ' 1', '+1'])('rejects %s', (value) => {
    expect(() => parseMarketplaceAmount(value)).toThrow();
  });
  it('rejects i128 overflow and uses the contract fee truncation', () => {
    expect(() => parseMarketplaceAmount(formatMarketplaceAmount(MAX_I128 + 1n))).toThrow();
    expect(marketplaceFee('10000001', 250)).toBe(250_000n);
    expect(marketplaceFee('1', 250)).toBe(0n);
    expect(() => marketplaceFee('100', 10001)).toThrow();
    expect(() => marketplaceFee(MAX_I128.toString(), 250)).toThrow('arithmetic limit');
  });
  it('keeps pool ids and secondary token ids within u32', () => {
    for (const kind of ['pool', 'secondary'] as const) {
      expect(() => marketplaceId('4294967296', kind)).toThrow();
      expect(marketplaceId('4294967295', kind)).toBe((1n << 32n) - 1n);
    }
    for (const id of ['-1', '1e2', '01', '1.0']) expect(() => marketplaceId(id, 'pool')).toThrow();
  });
});

describe('resale fee as a percent', () => {
  it('reads a percent with at most two decimals as exact basis points, within the 25% cap', () => {
    expect(feeBpsFromPercent('2.5')).toBe(250);
    expect(feeBpsFromPercent(' 0.07 ')).toBe(7);
    expect(feeBpsFromPercent('25')).toBe(2_500);
    expect(feeBpsFromPercent('0')).toBe(0);
    for (const input of ['', '25.01', '100', '1.234', '-1', '1e1', '.5', '2,5'])
      expect(feeBpsFromPercent(input)).toBeNull();
  });

  it('shows every basis-point fee as the percent that reads back to it', () => {
    for (let bps = 0; bps <= 2_500; bps += 1) expect(feeBpsFromPercent(feePercentText(bps))).toBe(bps);
    expect(feePercentText(250)).toBe('2.5');
    expect(feePercentText(1)).toBe('0.01');
  });
});
