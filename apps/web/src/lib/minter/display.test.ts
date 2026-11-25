import { describe, expect, it } from 'vitest';

import { claimListEndText, formatClaimDate } from './display';

const NOW = 1_800_000_000;

describe('claim dates', () => {
  it('formats a list expiry or drive deadline as a date', () => {
    expect(formatClaimDate(NOW)).toMatch(/2027/);
  });

  it('has no date for a time past what a Date can hold, such as u64::MAX', () => {
    // The ClaimMinter takes any future u64, and claim lists are read from chain.
    expect(formatClaimDate(Number('18446744073709551615'))).toBeNull();
    expect(formatClaimDate(Number('9223372036854775807'))).toBeNull();
    expect(formatClaimDate(8_640_000_000_001)).toBeNull();
    expect(formatClaimDate(Number.NaN)).toBeNull();
    expect(formatClaimDate(8_640_000_000_000)).toMatch(/275760/);
  });

  it('describes the end of a list in a sentence', () => {
    expect(claimListEndText(NOW + 60, NOW)).toMatch(/^closes .*2027/);
    expect(claimListEndText(NOW, NOW)).toMatch(/^closed .*2027/);
    expect(claimListEndText(Number('18446744073709551615'), NOW)).toBe('no closing date');
  });
});
