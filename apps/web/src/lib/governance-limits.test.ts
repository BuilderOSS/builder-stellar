import { describe, expect, it } from 'vitest';

import {
  validateAuctionTimeBuffer,
  validateProposalActionCount,
  validateProposalThreshold,
  validateQuorumBps,
  validateVotingDelay,
  validateVotingPeriod
} from './governance-limits';

describe('governance limits', () => {
  it('bounds voting timings to 300..=2_592_000 seconds', () => {
    expect(validateVotingDelay(299)).not.toBeNull();
    expect(validateVotingDelay(300)).toBeNull();
    expect(validateVotingPeriod(2_592_000)).toBeNull();
    expect(validateVotingPeriod(2_592_001)).not.toBeNull();
    expect(validateVotingPeriod(1.5)).not.toBeNull();
  });

  it('bounds the auction time buffer to 1..=86_400', () => {
    expect(validateAuctionTimeBuffer(0)).not.toBeNull();
    expect(validateAuctionTimeBuffer(1)).toBeNull();
    expect(validateAuctionTimeBuffer(86_400)).toBeNull();
    expect(validateAuctionTimeBuffer(86_401)).not.toBeNull();
  });

  it('bounds quorum to 1..=10_000 bps', () => {
    expect(validateQuorumBps(0)).not.toBeNull();
    expect(validateQuorumBps(1)).toBeNull();
    expect(validateQuorumBps(10_000)).toBeNull();
    expect(validateQuorumBps(10_001)).not.toBeNull();
  });

  it('requires an absolute proposal threshold of at least 1 vote', () => {
    expect(validateProposalThreshold(0)).not.toBeNull();
    expect(validateProposalThreshold(0n)).not.toBeNull();
    expect(validateProposalThreshold(1n)).toBeNull();
    expect(validateProposalThreshold(5000)).toBeNull();
  });

  it('caps proposals at 20 actions', () => {
    expect(validateProposalActionCount(20)).toBeNull();
    expect(validateProposalActionCount(21)).not.toBeNull();
  });
});
