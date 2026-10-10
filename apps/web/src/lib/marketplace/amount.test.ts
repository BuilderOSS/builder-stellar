import { describe, expect, it } from 'vitest';

import { formatMarketplaceAmount, marketplaceFee, marketplaceId, MAX_I128, parseMarketplaceAmount } from './amount';

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
  it('keeps u64 primary ids separate from u32 secondary token ids', () => {
    expect(marketplaceId('18446744073709551615', 'primary')).toBe((1n << 64n) - 1n);
    expect(() => marketplaceId('4294967296', 'secondary')).toThrow();
    expect(marketplaceId('4294967295', 'secondary')).toBe((1n << 32n) - 1n);
    for (const id of ['-1', '1e2', '01', '1.0']) expect(() => marketplaceId(id, 'primary')).toThrow();
  });
});
