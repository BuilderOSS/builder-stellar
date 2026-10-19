import { Address, StrKey, xdr } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';

import { namespacedKey } from '@/lib/storage-key';

import { auctionInstanceKey, readAuctionPaymentTokenLocked } from './auction-payment-lock';

const auction = StrKey.encodeContract(new Uint8Array(32).fill(4));

/** An auction instance entry holding `storage`, as getLedgerEntries returns it. */
function instance(storage: xdr.ScMapEntry[]) {
  const val = xdr.ScVal.scvContractInstance(
    new xdr.ScContractInstance({
      executable: xdr.ContractExecutable.contractExecutableWasm(Buffer.alloc(32)),
      storage
    })
  );
  return {
    entries: [
      {
        val: xdr.LedgerEntryData.contractData(
          new xdr.ContractDataEntry({
            ext: xdr.ExtensionPoint.v0(),
            contract: new Address(auction).toScAddress(),
            key: xdr.ScVal.scvLedgerKeyContractInstance(),
            durability: xdr.ContractDataDurability.persistent,
            val
          })
        )
      }
    ]
  };
}
const entry = (key: xdr.ScVal, val: xdr.ScVal) => new xdr.ScMapEntry({ key, val });

describe('auction payment token lock', () => {
  it('reads the PaymentTokenLocked flag the first bid sets', async () => {
    const config = entry(namespacedKey('Config'), xdr.ScVal.scvU32(1));
    const locked = entry(namespacedKey('PaymentTokenLocked'), xdr.ScVal.scvBool(true));
    let asked: xdr.LedgerKey[] = [];
    const server = (storage: xdr.ScMapEntry[]) => ({
      getLedgerEntries: async (...keys: xdr.LedgerKey[]) => {
        asked = keys;
        return instance(storage) as never;
      }
    });
    expect(await readAuctionPaymentTokenLocked(server([config, locked]), auction)).toBe(true);
    expect(asked.map((key) => key.toXDR('base64'))).toEqual([auctionInstanceKey(auction).toXDR('base64')]);
    expect(await readAuctionPaymentTokenLocked(server([config]), auction)).toBe(false);
    const unlocked = entry(namespacedKey('PaymentTokenLocked'), xdr.ScVal.scvBool(false));
    expect(await readAuctionPaymentTokenLocked(server([config, unlocked]), auction)).toBe(false);
  });

  it('fails when the auction instance is missing, so the composer treats the lock as unknown', async () => {
    await expect(
      readAuctionPaymentTokenLocked({ getLedgerEntries: async () => ({ entries: [] }) }, auction)
    ).rejects.toThrow(/could not be read/);
  });
});
