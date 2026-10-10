import { nativeToScVal, scValToNative, StrKey } from '@stellar/stellar-sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => ({
  state: vi.fn(),
  deadline: vi.fn(),
  snapshot: vi.fn(),
  quorum: vi.fn(),
  proposer: vi.fn(),
  entries: vi.fn()
}));
vi.mock('@builder-stellar/governor-bindings', () => ({
  Client: class {
    proposal_state = calls.state;
    proposal_deadline = calls.deadline;
    proposal_snapshot = calls.snapshot;
    quorum = calls.quorum;
    proposal_proposer = calls.proposer;
  }
}));
vi.mock('@stellar/stellar-sdk/rpc', () => ({
  Server: class {
    getLedgerEntries = calls.entries;
  }
}));
import type { DaoNetworkConfig } from './dao-config';
import { decodeProposalCore, proposalCoreKey, readProposalChainState } from './proposal-chain-state';

const config = {
  governorContractId: StrKey.encodeContract(new Uint8Array(32).fill(1)),
  rpcUrl: 'https://rpc.test',
  passphrase: 'passphrase',
  adminAddress: 'source'
} as DaoNetworkConfig;
const id = 'ab'.repeat(32);
describe('critical chain state versus optional reads', () => {
  beforeEach(() => {
    Object.values(calls).forEach((call) => call.mockReset());
    calls.state.mockResolvedValue({ result: 5 });
    calls.deadline.mockResolvedValue({ result: 100 });
    calls.snapshot.mockResolvedValue({ result: 20 });
    calls.quorum.mockResolvedValue({ result: 40n });
    calls.entries.mockResolvedValue({ entries: [] });
    calls.proposer.mockRejectedValue(new Error('Inherited proposer incompatible'));
  });
  it('preserves authoritative state if optional reads fail and never calls inherited proposer', async () => {
    calls.deadline.mockRejectedValue(new Error('deadline unavailable'));
    calls.entries.mockRejectedValue(new Error('storage unavailable'));
    const result = await readProposalChainState(config, id);
    expect(result).toMatchObject({ state: 5, stateSource: 'chain', core: null, deadline: null, quorumVotes: '40' });
    expect(calls.proposer).not.toHaveBeenCalled();
  });
  it('marks indexed fallback rather than inventing a chain state', async () => {
    calls.state.mockRejectedValue(new Error('RPC unavailable'));
    calls.quorum.mockRejectedValue(new Error('quorum unavailable'));
    expect(await readProposalChainState(config, id)).toMatchObject({
      state: null,
      stateSource: 'indexed',
      quorumVotes: null
    });
  });
  it('decodes exact historical vote start and ETA from the current custom storage key', () => {
    const value = nativeToScVal({ vote_start: 1000n, vote_end: 2000n, vote_snapshot: 50, eta: 3000n });
    expect(decodeProposalCore(value)).toEqual({ voteStart: 1000, voteEnd: 2000, snapshot: 50, eta: 3000 });
    const key = proposalCoreKey(config.governorContractId, id);
    if (key.type !== 'contractData') throw new Error('Wrong key');
    const decoded = scValToNative(key.contractData.key);
    expect(decoded[0]).toBe('Proposal');
    expect(Buffer.from(decoded[1]).toString('hex')).toBe(id);
    expect(() => decodeProposalCore(nativeToScVal({ vote_end: 2000n }))).toThrow();
  });
});
