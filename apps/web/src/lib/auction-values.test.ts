import { describe, expect, it } from 'vitest';

import { decimalToStroops, formatStroops, MIN_RESERVE_PRICE_STROOPS, validateReservePrice } from './auction-values';

describe('auction values', () => {
  it('converts token units to stroops', () => {
    expect(decimalToStroops('1.25')).toBe(12_500_000n);
    expect(decimalToStroops('0.0001')).toBe(MIN_RESERVE_PRICE_STROOPS);
  });

  it('formats stroops without losing precision', () => {
    expect(formatStroops(12_500_000n)).toBe('1.25');
    expect(formatStroops(1_000n)).toBe('0.0001');
  });

  it('enforces the contract minimum and precision', () => {
    expect(validateReservePrice('0.00009')).toContain('Minimum');
    expect(validateReservePrice('1.12345678')).toContain('valid amount');
    expect(validateReservePrice('0.0001')).toBeNull();
  });
});
