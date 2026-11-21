import { describe, expect, it } from 'vitest';

import { formatVotes, isMissingFunction, tokenVoteSource } from '@/lib/vote-source';

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

describe('isMissingFunction', () => {
  it('recognises a call to a function the contract lacks', () => {
    expect(
      isMissingFunction(
        new Error('HostError: Error(WasmVm, MissingValue) trying to invoke non-existent contract function')
      )
    ).toBe(true);
  });

  it('treats network and other failures as real errors', () => {
    expect(isMissingFunction(new Error('fetch failed'))).toBe(false);
    expect(isMissingFunction(new Error('Error(Storage, ExceededLimit)'))).toBe(false);
  });
});
