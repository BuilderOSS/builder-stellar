import { scValToNative } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';

import { keccak256Bytes } from '@/lib/keccak';
import { analyzeProposalAction, isHighRiskProposalAction } from '@/lib/proposal-action-identity';
import { getActionHandler } from '@/lib/proposal-actions/registry';
import { buildProposalCallVectors, encodeProposalCallArgs, proposalCallId } from '@/lib/proposal-call';

import { allocationQueueAction } from './allocation-proposal';
import { type AllocationDraft, encodeAllocation } from './proposal-actions';
import { ALICE, BOB, config, MINTER, minterSpec, state, TOKEN } from './test-fixtures';

const spec = minterSpec();
const trusted = { ...config, minterContractId: MINTER, minterSpec: spec.entries.map((entry) => entry.toXDR('base64')) };
const drafts: AllocationDraft[] = [
  { type: 'set-merkle-root', root: '0'.repeat(63) + '1' },
  { type: 'set-allowlist', addresses: [ALICE, BOB], amount: '9007199254740993' },
  { type: 'minter-batch-mint', recipients: [ALICE, BOB], amounts: ['1', '9007199254740993'] }
];

describe('trusted registered Minter governance allocations', () => {
  it('registers exact root, allowlist and batch descriptors and preserves indexed proposal IDs', () => {
    for (const draft of drafts) {
      const action = allocationQueueAction(draft, state, trusted, state.deploymentId);
      const vectors = buildProposalCallVectors([action], TOKEN, trusted.treasuryContractId, trusted);
      expect(vectors.targets).toEqual([MINTER]);
      expect(vectors.args[0]?.[0]).toBe(TOKEN);
      const encoded = encodeProposalCallArgs(vectors.targets, vectors.functions, vectors.args, trusted);
      const expected = encodeAllocation(spec, draft, TOKEN);
      expect(encoded[0]!.map((value) => value.toXDR('base64'))).toEqual(expected.map((value) => value.toXDR('base64')));
      const native = expected.map(scValToNative);
      const indexed = native.map((value) =>
        value instanceof Uint8Array
          ? { bytes: Buffer.from(value).toString('base64') }
          : typeof value === 'bigint'
            ? { u128: value.toString() }
            : Array.isArray(value)
              ? { vec: value.map((item) => (typeof item === 'bigint' ? { u128: item.toString() } : { address: item })) }
              : { address: value }
      );
      const rebuilt = encodeProposalCallArgs(vectors.targets, vectors.functions, [indexed], trusted);
      const hash = keccak256Bytes('Allocation');
      expect(proposalCallId(vectors.targets, vectors.functions, rebuilt, hash)).toBe(
        proposalCallId(vectors.targets, vectors.functions, encoded, hash)
      );
      expect(isHighRiskProposalAction(action)).toBe(true);
      expect(getActionHandler(draft.type)).toBeDefined();
    }
  });
  it('fails closed for another deployment, token, registration, network, admin, Live state or mint authority', () => {
    for (const changed of [
      { ...state, deploymentId: 'other' },
      { ...state, daoId: MINTER },
      { ...state, tokenContractId: MINTER },
      { ...state, minterContractId: TOKEN },
      { ...state, network: 'public' },
      { ...state, admin: ALICE },
      { ...state, live: false },
      { ...state, mintAuthority: false }
    ]) {
      expect(() => allocationQueueAction(drafts[0]!, changed, trusted, state.deploymentId)).toThrow();
    }
    expect(() =>
      allocationQueueAction(drafts[0]!, state, { ...trusted, minterSpec: undefined }, state.deploymentId)
    ).toThrow();
  });
  it('rejects guessed targets, cross-DAO token args, absent/old specs and unsafe numeric integers', () => {
    const encode = (target: string, args: unknown[], context = trusted) =>
      encodeProposalCallArgs([target], ['set_allowlist'], [args], context);
    expect(() => encode(MINTER, [MINTER, [ALICE], '1'])).toThrow(/match this DAO/);
    expect(() => encode(MINTER, [TOKEN, [ALICE], '1'], { ...trusted, minterContractId: '' })).toThrow(/Unsupported/);
    const old = minterSpec({ amountType: spec.getFunc('set_allowlist').inputs[0]!.type });
    expect(() =>
      encode(MINTER, [TOKEN, [ALICE], '1'], {
        ...trusted,
        minterSpec: old.entries.map((entry) => entry.toXDR('base64'))
      })
    ).toThrow(/Unsupported Minter ABI/);
    expect(() => encode(MINTER, [TOKEN, [ALICE], 9007199254740992])).toThrow(/Unsafe/);
  });
  it('separates root/list resources per token and retains non-idempotent batches', () => {
    const root = allocationQueueAction(drafts[0]!, state, trusted, state.deploymentId);
    const list = allocationQueueAction(drafts[1]!, state, trusted, state.deploymentId);
    expect(analyzeProposalAction(list, [root]).some((item) => item.kind === 'conflict')).toBe(false);
    expect(
      analyzeProposalAction({ ...root, id: 'next', root: 'ab'.repeat(32) }, [root]).some(
        (item) => item.kind === 'conflict'
      )
    ).toBe(true);
    expect(
      analyzeProposalAction({ ...root, id: 'other', tokenContractId: MINTER }, [root]).some(
        (item) => item.kind === 'conflict' || item.kind === 'duplicate'
      )
    ).toBe(false);
    const batch = allocationQueueAction(drafts[2]!, state, trusted, state.deploymentId);
    expect(
      analyzeProposalAction({ ...batch, id: 'another' }, [batch]).some(
        (item) => item.kind === 'conflict' || item.kind === 'duplicate'
      )
    ).toBe(false);
  });
});
