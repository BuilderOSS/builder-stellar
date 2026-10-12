import { Address, scValToNative, xdr } from '@stellar/stellar-sdk';
import type { Server } from '@stellar/stellar-sdk/rpc';
import { Buffer } from 'buffer';

import { namespacedKey } from '@/lib/storage-key';

import type { ClaimState } from './types';

type KeyName = 'MerkleRoot' | 'MerkleRound' | 'MerkleClaimed';

/** Exact persistent `common::ns(MinterKey::..)` encoding from contracts/minter/src/storage.rs. */
export function minterStorageKey(minter: string, token: string, name: KeyName, round?: number, recipient?: string) {
  const args = [new Address(token).toScVal()];
  if (round !== undefined) args.push(xdr.ScVal.scvU32(round));
  if (recipient !== undefined) args.push(new Address(recipient).toScVal());
  return xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: new Address(minter).toScAddress(),
      key: namespacedKey(name, ...args),
      durability: xdr.ContractDataDurability.persistent
    })
  );
}

async function values(server: Pick<Server, 'getLedgerEntries'>, keys: xdr.LedgerKey[]) {
  const response = await server.getLedgerEntries(...keys);
  const entries = new Map(response.entries.map((entry) => [entry.key.toXDR('base64'), entry]));
  return {
    ledger: response.latestLedger,
    values: keys.map((key) => {
      const entry = entries.get(key.toXDR('base64'));
      if (!entry) return null; // absent OR archived, never claim a verified false
      if (entry.val.type !== 'contractData') throw new Error('Unexpected Minter ledger entry.');
      return entry.val.contractData.val;
    })
  };
}
function roundValue(value: xdr.ScVal | null): number | null {
  if (value === null) return null;
  if (value.type !== 'scvU32') throw new Error('Invalid Minter round encoding.');
  return value.u32;
}
function markerValue(value: xdr.ScVal | null): boolean | null {
  if (value === null) return null;
  if (value.type !== 'scvBool') throw new Error('Invalid Minter marker encoding.');
  return value.b;
}
/** `MerkleConfig { root: BytesN<32>, tree_uri: String }`. */
function configValue(value: xdr.ScVal | null): { root: string; treeUri: string } | null {
  if (value === null) return null;
  const native = value.type === 'scvMap' ? (scValToNative(value) as { root?: unknown; tree_uri?: unknown }) : null;
  if (
    !native ||
    !(native.root instanceof Uint8Array) ||
    native.root.length !== 32 ||
    typeof native.tree_uri !== 'string'
  )
    throw new Error('Invalid Minter root encoding.');
  return { root: Buffer.from(native.root).toString('hex'), treeUri: native.tree_uri };
}

export async function readClaimStorage(
  server: Pick<Server, 'getLedgerEntries'>,
  minter: string,
  token: string,
  recipient: string | null
): Promise<{ ledger: number; merkle: ClaimState['merkle'] }> {
  const key = (name: KeyName, round?: number) =>
    minterStorageKey(minter, token, name, round, round === undefined ? undefined : (recipient ?? undefined));
  const initialKeys = [key('MerkleRoot'), key('MerkleRound')];
  const first = await values(server, initialKeys);
  const [configVal, roundVal] = first.values;
  const config = configValue(configVal ?? null);
  const merkle: ClaimState['merkle'] = {
    root: config?.root ?? null,
    treeUri: config?.treeUri ?? null,
    round: roundValue(roundVal ?? null),
    claimed: null
  };
  if (!recipient || merkle.round === null) return { ledger: first.ledger, merkle };
  // Include config again: if the round changes between RPC reads, fail rather than mixing rounds.
  const second = await values(server, [...initialKeys, key('MerkleClaimed', merkle.round)]);
  if (first.values.some((value, i) => value?.toXDR('base64') !== second.values[i]?.toXDR('base64')))
    throw new Error('The claim round changed while reading. Refresh the claims.');
  merkle.claimed = markerValue(second.values[2] ?? null);
  return { ledger: second.ledger, merkle };
}
