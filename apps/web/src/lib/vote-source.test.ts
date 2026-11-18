import { describe, expect, it } from 'vitest';

import { formatVotes, tokenVoteSource } from '@/lib/vote-source';

describe('vote source display', () => {
  it('shows token votes as whole numbers', () => {
    expect(formatVotes(1234n, 0)).toBe('1234');
    expect(tokenVoteSource('CTOKEN')).toEqual({ address: 'CTOKEN', isToken: true, decimals: 0 });
  });

  it('scales adapter units by their decimals, trimming trailing zeros', () => {
    expect(formatVotes(1_500_000_000n, 9)).toBe('1.5');
    expect(formatVotes(2_000_000_000n, 9)).toBe('2');
    expect(formatVotes(1n, 9)).toBe('0');
    expect(formatVotes(123_456_789n, 9)).toBe('0.1234');
  });
});
