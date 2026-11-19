import { describe, expect, it } from 'vitest';

import { mergeHolders } from './facts';

const member = (address: string, owned: string, votes: string) => ({
  address,
  owned_token_count: owned,
  voting_power: votes,
  delegated_to: null,
  last_activity_ledger: null
});

describe('mergeHolders', () => {
  it('keeps an owner who delegated every vote away, so the ownership test can see them', () => {
    const byTokens = [member('GOWNER', '5', '0'), member('GDELEGATE', '1', '6')];
    const byVotes = [member('GDELEGATE', '1', '6')];
    expect(mergeHolders(byTokens, byVotes)).toEqual([
      { address: 'GOWNER', ownedTokens: 5n, votingPower: 0n },
      { address: 'GDELEGATE', ownedTokens: 1n, votingPower: 6n }
    ]);
  });

  it('tolerates a ranking that has not loaded', () => {
    expect(mergeHolders(undefined, [member('GA', '1', '1')])).toHaveLength(1);
  });
});
