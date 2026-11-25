import { describe, expect, it } from 'vitest';

import { claimListEndText, formatClaimDate, founderSupplyText } from './display';

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

describe('founder supply', () => {
  it('says what free Setup lists can still mint, and how to stop it once live', () => {
    expect(founderSupplyText({ unclaimed: 6, lists: 2, allowance: 0xffffffff, live: true })).toEqual({
      title: 'Founder supply: 6 tokens can still be minted',
      description:
        '6 tokens on 2 claim lists opened during setup are not claimed yet, so they are not in the token supply. People on those lists can still claim them until each list closes. A proposal can close a list early to stop this.'
    });
  });

  it('caps the tokens at the claims module’s allowance', () => {
    const text = founderSupplyText({ unclaimed: 6, lists: 1, allowance: 2, live: false });
    expect(text?.title).toBe('Founder supply: 2 tokens can still be minted');
    expect(text?.description).toContain('a claim list opened during setup');
    expect(text?.description).toContain('The claims module can mint 2 tokens of them, its remaining mint allowance.');
    expect(text?.description).toContain('They stay claimable after launch, until each list closes.');
  });

  it('says when no allowance is left, and nothing when there is no supply', () => {
    expect(founderSupplyText({ unclaimed: 1, lists: 1, allowance: 0, live: true })?.description).toContain(
      'none can be minted until a proposal raises it'
    );
    expect(founderSupplyText({ unclaimed: 0, lists: 0, allowance: 5, live: true })).toBeNull();
  });
});
