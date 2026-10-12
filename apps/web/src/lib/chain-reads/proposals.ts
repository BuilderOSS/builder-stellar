/**
 * The proposal list from chain state alone (docs/STORAGE_DIET.md § 8, D10), used
 * when the indexer is down. The Governor keeps a counter and one
 * `ProposalId(seq)` entry per proposal; `proposal(id)` returns its timing and
 * state. Titles and vote totals live in events, so this list has neither.
 *
 * Ids are read as ledger entries rather than through `proposal_ids`: an ended
 * proposal's id entry may be archived, which fails a whole `proposal_ids` page
 * but only drops that one row here.
 */
import { Address, scValToNative, xdr } from '@stellar/stellar-sdk';
import { Buffer } from 'buffer';

import { proposalIdFromBuffer } from '@/lib/proposal-id';
import type { ProposalState } from '@/lib/proposal-state';
import { namespacedKey } from '@/lib/storage-key';

export type ChainProposal = {
  proposalId: string;
  /** 1-based, matching the indexer's proposal_number. */
  proposalNumber: number;
  /** null when the proposal's entries are archived or could not be read. */
  state: ProposalState | null;
  voteStart: number;
  voteEnd: number;
};

export type ChainProposalReader = {
  count(): Promise<number>;
  /** Raw ledger reads; absent and archived entries are simply missing from the result. */
  entries(keys: xdr.LedgerKey[]): Promise<Map<string, xdr.ScVal>>;
  proposal(id: Uint8Array): Promise<{ state: number; vote_start: bigint; vote_end: bigint }>;
};

/** contracts/governor/src/storage.rs: common::ns(GovernorKey::ProposalId(u32)), persistent. */
export function proposalIdKey(governor: string, seq: number) {
  return xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: new Address(governor).toScAddress(),
      key: namespacedKey('ProposalId', xdr.ScVal.scvU32(seq)),
      durability: xdr.ContractDataDurability.persistent
    })
  );
}

/** Newest first: `offset` and `limit` count from the latest proposal down. */
export async function chainProposalPage(
  reader: ChainProposalReader,
  governor: string,
  { limit, offset }: { limit: number; offset: number }
): Promise<{ items: ChainProposal[]; total: number; hasMore: boolean }> {
  const total = await reader.count();
  const newest = total - 1 - offset;
  const oldest = Math.max(0, newest - limit + 1);
  const seqs: number[] = [];
  for (let seq = newest; seq >= oldest; seq--) seqs.push(seq);
  if (!seqs.length) return { items: [], total, hasMore: false };

  const keys = seqs.map((seq) => proposalIdKey(governor, seq));
  const values = await reader.entries(keys);
  const rows = seqs.flatMap((seq, i) => {
    const value = values.get(keys[i]!.toXDR('base64'));
    if (value?.type !== 'scvBytes') return [];
    const id = Buffer.from(scValToNative(value) as Uint8Array);
    return id.length === 32 ? [{ seq, id }] : [];
  });
  const infos = await Promise.allSettled(rows.map(({ id }) => reader.proposal(id)));
  const items = rows.map(({ seq, id }, i): ChainProposal => {
    const info = infos[i]!;
    return {
      proposalId: proposalIdFromBuffer(id),
      proposalNumber: seq + 1,
      state: info.status === 'fulfilled' ? (Number(info.value.state) as ProposalState) : null,
      voteStart: info.status === 'fulfilled' ? Number(info.value.vote_start) : 0,
      voteEnd: info.status === 'fulfilled' ? Number(info.value.vote_end) : 0
    };
  });
  return { items, total, hasMore: oldest > 0 };
}
