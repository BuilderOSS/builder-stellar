import { Address, scValToNative, xdr } from '@stellar/stellar-sdk';
import type { Server } from '@stellar/stellar-sdk/rpc';
import { Buffer } from 'buffer';

import type { ClaimState } from './types';

type KeyName =
  | 'MerkleRoot'
  | 'MerkleRound'
  | 'AllowlistVersion'
  | 'AllowlistAmount'
  | 'Allowlisted'
  | 'MerkleClaimed'
  | 'AllowlistClaimed';

/** Exact persistent MinterKey tuple encoding from contracts/minter/src/storage.rs. */
export function minterStorageKey(minter: string, token: string, name: KeyName, round?: number, recipient?: string) {
  const args = [xdr.ScVal.scvSymbol(name), new Address(token).toScVal()];
  if (round !== undefined) args.push(xdr.ScVal.scvU32(round));
  if (recipient !== undefined) args.push(new Address(recipient).toScVal());
  return xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: new Address(minter).toScAddress(),
      key: xdr.ScVal.scvVec(args),
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

export async function readClaimStorage(
  server: Pick<Server, 'getLedgerEntries'>,
  minter: string,
  token: string,
  recipient: string | null
) {
  const key = (name: KeyName, round?: number) =>
    minterStorageKey(minter, token, name, round, round === undefined ? undefined : (recipient ?? undefined));
  const initialKeys = [key('MerkleRoot'), key('MerkleRound'), key('AllowlistAmount'), key('AllowlistVersion')];
  const first = await values(server, initialKeys);
  const [rootVal, merkleRoundVal, amountVal, versionVal] = first.values;
  if (rootVal && (rootVal.type !== 'scvBytes' || rootVal.bytes.value.length !== 32))
    throw new Error('Invalid Minter root encoding.');
  if (amountVal && amountVal.type !== 'scvU128') throw new Error('Invalid Minter amount encoding.');
  const merkle: ClaimState['merkle'] = {
    root: rootVal ? Buffer.from(rootVal.bytes.value).toString('hex') : null,
    round: roundValue(merkleRoundVal),
    claimed: null
  };
  const allowlist: ClaimState['allowlist'] = {
    amount: amountVal ? String(scValToNative(amountVal)) : null,
    round: roundValue(versionVal),
    member: null,
    claimed: null
  };
  const keys: xdr.LedgerKey[] = [];
  if (recipient && merkle.round !== null) keys.push(key('MerkleClaimed', merkle.round));
  if (recipient && allowlist.round !== null)
    keys.push(key('Allowlisted', allowlist.round), key('AllowlistClaimed', allowlist.round));
  if (keys.length) {
    // Include config again: if a round changes between RPC reads, fail rather than mixing rounds.
    const second = await values(server, [...initialKeys, ...keys]);
    if (first.values.some((value, i) => value?.toXDR('base64') !== second.values[i]?.toXDR('base64')))
      throw new Error('Allocation changed while reading. Refresh the claim rounds.');
    let i = 4;
    if (merkle.round !== null) merkle.claimed = markerValue(second.values[i++]);
    if (allowlist.round !== null) {
      allowlist.member = markerValue(second.values[i++]);
      allowlist.claimed = markerValue(second.values[i]);
    }
    return { ledger: second.ledger, merkle, allowlist };
  }
  return { ledger: first.ledger, merkle, allowlist };
}
