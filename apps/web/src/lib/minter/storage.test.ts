import { nativeToScVal, scValToNative, xdr } from '@stellar/stellar-sdk';
import type { Api, Server } from '@stellar/stellar-sdk/rpc';
import { describe, expect, it, vi } from 'vitest';

import { minterStorageKey, readClaimStorage } from './storage';
import { ALICE, BOB, MINTER, TOKEN, TREASURY } from './test-fixtures';

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

describe('persistent Minter storage reads', () => {
  it('encodes per-token/method/round/recipient tuples, never shared-Minter-only identity', () => {
    const key = minterStorageKey(MINTER, TOKEN, 'AllowlistClaimed', 0xffffffff, ALICE);
    if (key.type !== 'contractData') throw new Error('Unexpected key');
    expect(scValToNative(key.contractData.key)).toEqual(['AllowlistClaimed', TOKEN, 0xffffffff, ALICE]);
    const keys = [
      key,
      minterStorageKey(MINTER, TREASURY, 'AllowlistClaimed', 0xffffffff, ALICE),
      minterStorageKey(MINTER, TOKEN, 'MerkleClaimed', 0xffffffff, ALICE),
      minterStorageKey(MINTER, TOKEN, 'AllowlistClaimed', 1, ALICE),
      minterStorageKey(MINTER, TOKEN, 'AllowlistClaimed', 0xffffffff, BOB)
    ].map((value) => value.toXDR('hex'));
    expect(new Set(keys).size).toBe(keys.length);
  });
  it('preserves missing markers as unknown while reading exact rounds, amount and membership', async () => {
    const getLedgerEntries = vi.fn(async (...keys: xdr.LedgerKey[]) => ({
      latestLedger: 321,
      entries: keys.flatMap((key) => {
        if (key.type !== 'contractData') throw new Error('Unexpected key');
        const name = (scValToNative(key.contractData.key) as unknown[])[0];
        const values: Record<string, xdr.ScVal> = {
          MerkleRoot: xdr.ScVal.scvBytes(Buffer.alloc(32, 9)),
          MerkleRound: xdr.ScVal.scvU32(2),
          AllowlistVersion: xdr.ScVal.scvU32(3),
          AllowlistAmount: nativeToScVal(9007199254740993n, { type: 'u128' }),
          Allowlisted: xdr.ScVal.scvBool(true)
        };
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
      merkle: { root: '09'.repeat(32), round: 2, claimed: null },
      allowlist: { round: 3, amount: '9007199254740993', member: true, claimed: null }
    });
    expect(getLedgerEntries).toHaveBeenCalledTimes(2);
    for (const call of getLedgerEntries.mock.calls)
      for (const key of call) {
        if (key.type !== 'contractData') throw new Error('Unexpected key');
        expect((scValToNative(key.contractData.key) as unknown[])[1]).toBe(TOKEN);
      }
  });
  it('does not invent rounds or eligibility from missing/archived entries', async () => {
    const server = { getLedgerEntries: vi.fn().mockResolvedValue({ latestLedger: 1, entries: [] }) };
    const result = await readClaimStorage(server, MINTER, TOKEN, ALICE);
    expect(result.merkle).toEqual({ root: null, round: null, claimed: null });
    expect(result.allowlist).toEqual({ amount: null, round: null, member: null, claimed: null });
    expect(server.getLedgerEntries).toHaveBeenCalledTimes(1);
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
            return (scValToNative(key.contractData.key) as unknown[])[0] === 'MerkleRound'
              ? [entry(key, xdr.ScVal.scvU32(read))]
              : [];
          })
        };
      })
    };
    await expect(readClaimStorage(server, MINTER, TOKEN, ALICE)).rejects.toThrow('changed');
  });
});
