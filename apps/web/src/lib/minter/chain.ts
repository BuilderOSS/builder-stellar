import type { AssuranceState, ClaimList, ClaimRecord } from '@builder-stellar/claim-minter-bindings';
import { Buffer } from 'buffer';

import { readHolderValue } from '@/lib/token-holder/read';

import type { ClaimMinter } from './client';
import type { AssuranceView, ClaimListView } from './types';

/** The newest lists the claims page reads from chain; older ones are history in the index. */
export const CLAIM_LISTS_SHOWN = 10;

export type ChainList = Omit<ClaimListView, 'claimList'>;

function u32(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 0xffffffff)
    throw new Error('Invalid ClaimMinter integer.');
  return value;
}

function list(value: unknown): ClaimList | null {
  if (value === null || value === undefined) return null;
  const item = value as ClaimList;
  if (!(item.root instanceof Uint8Array) || item.root.length !== 32 || typeof item.tree_uri !== 'string')
    throw new Error('Invalid ClaimMinter list.');
  return item;
}

function record(value: unknown): ClaimRecord {
  const item = value as ClaimRecord;
  if (!item || typeof item.escrowed !== 'bigint') throw new Error('Invalid ClaimMinter claim record.');
  return { claimed: u32(item.claimed), escrowed: item.escrowed };
}

function assuranceState(value: unknown): AssuranceView['state'] {
  const result = value as { isOk?: () => boolean; unwrap?: () => AssuranceState };
  if (!result?.isOk?.()) throw new Error('Invalid ClaimMinter assurance state.');
  const tag = result.unwrap!().tag;
  return tag === 'Met' ? 'met' : tag === 'Failed' ? 'failed' : 'open';
}

/**
 * The newest lists first, each with the connected wallet's record. Every value is a
 * simulation of the ClaimMinter's own getters: an archived entry fails the read (restore
 * first) instead of reading as empty.
 */
export async function readClaimLists(
  client: ClaimMinter,
  address: string | null
): Promise<{ nextListId: number; lists: ChainList[] }> {
  const next = readHolderValue(await client.next_list_id(), u32);
  const ids = Array.from({ length: Math.min(next, CLAIM_LISTS_SHOWN) }, (_, i) => next - 1 - i);
  const rows = await Promise.all(
    ids.map(async (listId): Promise<ChainList | null> => {
      const item = readHolderValue(await client.get_list({ list_id: listId }), list);
      if (!item) return null;
      const threshold = u32(item.threshold_claimers);
      const [mine, state] = await Promise.all([
        address
          ? client.get_claim({ list_id: listId, claimer: address }).then((tx) => readHolderValue(tx, record))
          : null,
        threshold > 0
          ? client.assurance_state({ list_id: listId }).then((tx) => readHolderValue(tx, assuranceState))
          : null
      ]);
      return {
        listId,
        root: Buffer.from(item.root).toString('hex'),
        treeUri: item.tree_uri,
        asset: item.asset,
        price: item.price.toString(),
        expiresAt: Number(item.expires_at),
        total: u32(item.total),
        minted: u32(item.minted),
        claimers: u32(item.claimers),
        assurance: state ? { thresholdClaimers: threshold, deadline: Number(item.deadline), state } : null,
        claimed: mine ? mine.claimed : null,
        escrowed: mine ? mine.escrowed.toString() : null
      };
    })
  );
  return { nextListId: next, lists: rows.filter((row): row is ChainList => row !== null) };
}
