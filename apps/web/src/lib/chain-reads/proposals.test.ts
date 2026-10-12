import { scValToNative, StrKey, xdr } from '@stellar/stellar-sdk';
import { Buffer } from 'buffer';
import { describe, expect, it, vi } from 'vitest';

import { ProposalState } from '@/lib/proposal-state';

import { chainProposalPage, type ChainProposalReader, proposalIdKey } from './proposals';

const GOVERNOR = StrKey.encodeContract(Buffer.alloc(32, 2));
const idFor = (seq: number) => Buffer.alloc(32, seq + 1);

/** A Governor with `count` proposals; `archived` seqs have no id entry, `stale` ones fail proposal(). */
function governor(count: number, { archived = [] as number[], stale = [] as number[] } = {}): ChainProposalReader {
  return {
    count: async () => count,
    entries: vi.fn(async (keys: xdr.LedgerKey[]) => {
      const values = new Map<string, xdr.ScVal>();
      for (const key of keys) {
        if (key.type !== 'contractData') throw new Error('Unexpected key');
        const [, [variant, seq]] = scValToNative(key.contractData.key) as [string, [string, number]];
        if (variant !== 'ProposalId') throw new Error('Unexpected variant');
        if (!archived.includes(seq)) values.set(key.toXDR('base64'), xdr.ScVal.scvBytes(idFor(seq)));
      }
      return values;
    }),
    proposal: async (id) => {
      const seq = id[0]! - 1;
      if (stale.includes(seq)) throw new Error('archived');
      return {
        state: seq % 2 ? ProposalState.Active : ProposalState.Executed,
        vote_start: BigInt(1000 + seq),
        vote_end: 2000n
      };
    }
  };
}

describe('proposal list from chain', () => {
  it('pins the namespaced ProposalId key', () => {
    const key = proposalIdKey(GOVERNOR, 7);
    if (key.type !== 'contractData') throw new Error('Unexpected key');
    expect(scValToNative(key.contractData.key)).toEqual(['buildeross', ['ProposalId', 7]]);
  });
  it('pages newest first with 1-based numbers matching the indexer', async () => {
    const first = await chainProposalPage(governor(5), GOVERNOR, { limit: 2, offset: 0 });
    expect(first.items.map((item) => item.proposalNumber)).toEqual([5, 4]);
    expect(first.items[0]).toEqual({
      proposalId: idFor(4).toString('hex'),
      proposalNumber: 5,
      state: ProposalState.Executed,
      voteStart: 1004,
      voteEnd: 2000
    });
    expect(first).toMatchObject({ total: 5, hasMore: true });
    const last = await chainProposalPage(governor(5), GOVERNOR, { limit: 2, offset: 4 });
    expect(last.items.map((item) => item.proposalNumber)).toEqual([1]);
    expect(last.hasMore).toBe(false);
    expect(await chainProposalPage(governor(0), GOVERNOR, { limit: 24, offset: 0 })).toEqual({
      items: [],
      total: 0,
      hasMore: false
    });
  });
  it('drops archived ids and marks proposals whose state cannot be read', async () => {
    const page = await chainProposalPage(governor(4, { archived: [2], stale: [1] }), GOVERNOR, {
      limit: 24,
      offset: 0
    });
    expect(page.items.map((item) => [item.proposalNumber, item.state])).toEqual([
      [4, ProposalState.Active],
      [2, null],
      [1, ProposalState.Executed]
    ]);
  });
});
