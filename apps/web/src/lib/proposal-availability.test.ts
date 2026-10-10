import { describe, expect, it } from 'vitest';

import { proposalActionAvailability } from './proposal-availability';
import { ProposalState } from './proposal-state';

const detail = {
  state: ProposalState.Queued,
  stateSource: 'chain' as const,
  proposer: 'proposer',
  vote_end: 500,
  eta: 1000,
  expiresAt: 2000
};
describe('source-backed proposal action gates', () => {
  it('lets any fee-paying source queue/execute, never requires owner or proposer', () => {
    expect(
      proposalActionAvailability({ ...detail, state: ProposalState.Succeeded }, 900000, 'unrelated-source').queue
    ).toBe(true);
    expect(proposalActionAvailability(detail, 1000000, 'unrelated-source').execute).toBe(true);
    expect(proposalActionAvailability(detail, 1000000, '').execute).toBe(false);
  });
  it('rejects before ETA and at exact expiry; absent ETA is not ready', () => {
    expect(proposalActionAvailability(detail, 999999, 'source').execute).toBe(false);
    expect(proposalActionAvailability(detail, 1999999, 'source').execute).toBe(true);
    expect(proposalActionAvailability(detail, 2000000, 'source').execute).toBe(false);
    expect(proposalActionAvailability({ ...detail, eta: 0 }, 1000000, 'source').execute).toBe(false);
    expect(proposalActionAvailability({ ...detail, state: ProposalState.Succeeded }, 2000000, 'source').queue).toBe(
      false
    );
  });
  it('limits cancel to Pending/Active proposer and vote to before deadline', () => {
    for (const state of [ProposalState.Pending, ProposalState.Active]) {
      expect(proposalActionAvailability({ ...detail, state }, 400000, 'proposer').cancel).toBe(true);
      expect(proposalActionAvailability({ ...detail, state }, 400000, 'other').cancel).toBe(false);
    }
    expect(proposalActionAvailability(detail, 1000000, 'proposer').cancel).toBe(false);
    expect(proposalActionAvailability({ ...detail, state: ProposalState.Active }, 500000, 'source').vote).toBe(false);
  });
  it('fails closed for indexed-only state or terminal states', () => {
    expect(
      Object.values(proposalActionAvailability({ ...detail, stateSource: 'indexed' }, 1000000, 'proposer'))
    ).toEqual([false, false, false, false]);
    for (const state of [
      ProposalState.Expired,
      ProposalState.Executed,
      ProposalState.Defeated,
      ProposalState.Canceled
    ]) {
      expect(Object.values(proposalActionAvailability({ ...detail, state }, 1000000, 'proposer'))).toEqual([
        false,
        false,
        false,
        false
      ]);
    }
  });
});
