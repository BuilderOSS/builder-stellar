import { Keypair, nativeToScVal, scValToNative, StrKey } from '@stellar/stellar-sdk';
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
import { packedProposal } from '@/lib/chain-reads/proposal-core';

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
  const storedCore = (quorum: bigint) => ({
    entries: [
      {
        val: {
          type: 'contractData',
          contractData: {
            val: packedProposal({
              proposer: Keypair.random().publicKey(),
              voteSnapshot: 20,
              voteStart: 1000,
              voteEnd: 2000,
              eta: 3000,
              state: 5,
              seq: 1,
              quorum
            })
          }
        }
      }
    ]
  });
  it('shows the quorum the contract stored, never a recomputed one', async () => {
    // governor.quorum(snapshot) would say 40; the proposal was created against 42
    // (tokens minted in the creation ledger count, D33). The page must say 42.
    calls.entries.mockResolvedValue(storedCore(42n));
    const result = await readProposalChainState(config, id);
    expect(result.quorumVotes).toBe('42');
    expect(result.core).toEqual({ voteStart: 1000, voteEnd: 2000, snapshot: 20, eta: 3000, quorum: '42' });
    expect(calls.quorum).not.toHaveBeenCalled();
  });
  beforeEach(() => {
    calls.proposer.mockRejectedValue(new Error('Inherited proposer incompatible'));
  });
  it('preserves authoritative state if optional reads fail and never calls inherited proposer', async () => {
    calls.deadline.mockRejectedValue(new Error('deadline unavailable'));
    calls.entries.mockRejectedValue(new Error('storage unavailable'));
    const result = await readProposalChainState(config, id);
    expect(result).toMatchObject({ state: 5, stateSource: 'chain', core: null, deadline: null, quorumVotes: null });
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
    const value = packedProposal({
      proposer: Keypair.random().publicKey(),
      voteSnapshot: 50,
      voteStart: 1000,
      voteEnd: 2000,
      eta: 3000,
      state: 5,
      seq: 7,
      quorum: 3n
    });
    expect(decodeProposalCore(value)).toEqual({ voteStart: 1000, voteEnd: 2000, snapshot: 50, eta: 3000, quorum: '3' });
    const key = proposalCoreKey(config.governorContractId, id);
    if (key.type !== 'contractData') throw new Error('Wrong key');
    const [namespace, decoded] = scValToNative(key.contractData.key);
    expect(namespace).toBe('builder');
    expect(decoded[0]).toBe('ProposalTime');
    expect(Buffer.from(decoded[1]).toString('hex')).toBe(id);
    expect(() => decodeProposalCore(nativeToScVal({ vote_end: 2000n }))).toThrow();
  });
});
