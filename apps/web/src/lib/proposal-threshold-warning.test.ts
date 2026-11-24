import { describe, expect, it } from 'vitest';

import { proposalThresholdWarning } from './proposal-threshold-warning';

describe('proposalThresholdWarning', () => {
  it('is silent when members hold enough votes, or either number is unknown', () => {
    expect(proposalThresholdWarning({ supply: 2n, threshold: 2n })).toBeNull();
    expect(proposalThresholdWarning({ supply: 1n, threshold: 2n, adding: 1n })).toBeNull();
    expect(proposalThresholdWarning({ supply: undefined, threshold: 2n })).toBeNull();
    expect(proposalThresholdWarning({ supply: 0n, threshold: null })).toBeNull();
  });

  it('counts the mint being prepared and says how many more tokens are needed', () => {
    expect(proposalThresholdWarning({ supply: 0n, threshold: 4n, adding: 1n })).toBe(
      'A proposal needs 4 votes. After this mint, members hold 1 vote, so no one could propose after launch. Mint 3 more founder tokens, or lower the proposal threshold in Voting rules.'
    );
  });
});
