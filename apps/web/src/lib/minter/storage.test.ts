import { nativeToScVal, scValToNative, xdr } from '@stellar/stellar-sdk';
import type { Api, Server } from '@stellar/stellar-sdk/rpc';
import { describe, expect, it, vi } from 'vitest';

import { minterStorageKey, readClaimStorage } from './storage';
import { ALICE, BOB, MINTER, TOKEN, TREASURY } from './test-fixtures';

/** The `MinterKey` variant inside `("builder", [Variant, ..args])`. */
function variant(key: xdr.ScVal): unknown[] {
  const [namespace, inner] = scValToNative(key) as [string, unknown[]];
  if (namespace !== 'builder') throw new Error('Key is not namespaced');
  return inner;
}

function entry(key: xdr.LedgerKey, val: xdr.ScVal): Api.LedgerEntryResult {
  if (key.type !== 'contractData') throw new Error('Expected contractData');
  return {
    key,
    val: xdr.LedgerEntryData.contractData(
      new xdr.ContractDataEntry({
        ext: xdr.ExtensionPoint.v0(),
        contract: key.contractData.contract,
        key: key.contractData.key,
        durability: key.contractData.durability,
        val
      })
    )
  };
}

const CONFIG = nativeToScVal(
  { root: Buffer.alloc(32, 9), tree_uri: 'ipfs://bafytree' },
  { type: { root: ['symbol', 'bytes'], tree_uri: ['symbol', 'string'] } }
);

describe('persistent Minter storage reads', () => {
  it('encodes per-token/round/recipient tuples, never shared-Minter-only identity', () => {
    const key = minterStorageKey(MINTER, TOKEN, 'MerkleClaimed', 0xffffffff, ALICE);
    if (key.type !== 'contractData') throw new Error('Unexpected key');
    expect(scValToNative(key.contractData.key)).toEqual(['builder', ['MerkleClaimed', TOKEN, 0xffffffff, ALICE]]);
    const keys = [
      key,
      minterStorageKey(MINTER, TREASURY, 'MerkleClaimed', 0xffffffff, ALICE),
      minterStorageKey(MINTER, TOKEN, 'MerkleClaimed', 1, ALICE),
      minterStorageKey(MINTER, TOKEN, 'MerkleClaimed', 0xffffffff, BOB),
      minterStorageKey(MINTER, TOKEN, 'MerkleRoot'),
      minterStorageKey(MINTER, TOKEN, 'MerkleRound')
    ].map((value) => value.toXDR('hex'));
    expect(new Set(keys).size).toBe(keys.length);
  });
  it('preserves missing markers as unknown while reading the exact root, tree and round', async () => {
    const getLedgerEntries = vi.fn(async (...keys: xdr.LedgerKey[]) => ({
      latestLedger: 321,
      entries: keys.flatMap((key) => {
        if (key.type !== 'contractData') throw new Error('Unexpected key');
        const name = variant(key.contractData.key)[0];
        const values: Record<string, xdr.ScVal> = { MerkleRoot: CONFIG, MerkleRound: xdr.ScVal.scvU32(2) };
        const val = values[String(name)];
        return val ? [entry(key, val)] : [];
      })
    }));
    const result = await readClaimStorage(
      { getLedgerEntries } as Pick<Server, 'getLedgerEntries'>,
      MINTER,
      TOKEN,
      ALICE
    );
    expect(result).toEqual({
      ledger: 321,
      merkle: { root: '09'.repeat(32), treeUri: 'ipfs://bafytree', round: 2, claimed: null }
    });
    expect(getLedgerEntries).toHaveBeenCalledTimes(2);
    for (const call of getLedgerEntries.mock.calls)
      for (const key of call) {
        if (key.type !== 'contractData') throw new Error('Unexpected key');
        expect(variant(key.contractData.key)[1]).toBe(TOKEN);
      }
  });
  it('does not invent rounds or eligibility from missing/archived entries', async () => {
    const server = { getLedgerEntries: vi.fn().mockResolvedValue({ latestLedger: 1, entries: [] }) };
    const result = await readClaimStorage(server, MINTER, TOKEN, ALICE);
    expect(result.merkle).toEqual({ root: null, treeUri: null, round: null, claimed: null });
    expect(server.getLedgerEntries).toHaveBeenCalledTimes(1);
  });
  it('refuses a root entry that is not a MerkleConfig', async () => {
    const server = {
      getLedgerEntries: vi.fn(async (...keys: xdr.LedgerKey[]) => ({
        latestLedger: 1,
        entries: keys.flatMap((key) => {
          if (key.type !== 'contractData') throw new Error('Unexpected key');
          return variant(key.contractData.key)[0] === 'MerkleRoot'
            ? [entry(key, xdr.ScVal.scvBytes(Buffer.alloc(32, 9)))]
            : [];
        })
      }))
    };
    await expect(readClaimStorage(server, MINTER, TOKEN, ALICE)).rejects.toThrow('root encoding');
  });
  it('fails closed if allocation changes between config and marker reads', async () => {
    let read = 0;
    const server = {
      getLedgerEntries: vi.fn(async (...keys: xdr.LedgerKey[]) => {
        read++;
        return {
          latestLedger: read,
          entries: keys.flatMap((key) => {
            if (key.type !== 'contractData') throw new Error('Unexpected key');
            return variant(key.contractData.key)[0] === 'MerkleRound' ? [entry(key, xdr.ScVal.scvU32(read))] : [];
          })
        };
      })
    };
    await expect(readClaimStorage(server, MINTER, TOKEN, ALICE)).rejects.toThrow('changed');
  });
});
