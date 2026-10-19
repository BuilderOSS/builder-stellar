import { Address, scValToNative, xdr } from '@stellar/stellar-sdk';
import { Server } from '@stellar/stellar-sdk/rpc';
import useSWR from 'swr';

import type { DaoNetworkConfig } from '@/lib/dao-config';
import { namespacedKey } from '@/lib/storage-key';

/**
 * Whether the auction's payment token is locked. The first bid sets `PaymentTokenLocked` in the
 * auction's instance storage (contracts/auction/src/storage.rs) and `set_payment_token` then fails
 * with InvalidConfig (7408). The contract has no getter, so this reads the flag from the instance
 * entry: one RPC call, exact, with no indexer lag. The key layout is the one `namespacedKey` already
 * follows for the renewal sweep.
 */
const LOCKED_KEY = namespacedKey('PaymentTokenLocked').toXDR('base64');

type LedgerEntries = {
  getLedgerEntries: (
    ...keys: xdr.LedgerKey[]
  ) => Promise<{ entries: Array<{ val: { type: string; contractData?: { val: xdr.ScVal } } }> }>;
};

export function auctionInstanceKey(auctionContractId: string) {
  return xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: new Address(auctionContractId).toScAddress(),
      key: xdr.ScVal.scvLedgerKeyContractInstance(),
      durability: xdr.ContractDataDurability.persistent
    })
  );
}

export async function readAuctionPaymentTokenLocked(server: LedgerEntries, auctionContractId: string) {
  const { entries } = await server.getLedgerEntries(auctionInstanceKey(auctionContractId));
  const value = entries[0]?.val.type === 'contractData' ? entries[0].val.contractData?.val : undefined;
  if (!value || value.type !== 'scvContractInstance') throw new Error('The auction contract could not be read.');
  const stored = (value.instance.storage ?? []).find((item) => item.key.toXDR('base64') === LOCKED_KEY);
  return stored ? scValToNative(stored.val) === true : false;
}

/** The lock for the composer: undefined while loading or when the read fails (the vote still checks). */
export function useAuctionPaymentTokenLocked(config: Pick<DaoNetworkConfig, 'auctionContractId' | 'rpcUrl'>) {
  return useSWR(
    config.auctionContractId ? ['auction-payment-token-locked', config.auctionContractId, config.rpcUrl] : null,
    ([, auctionContractId, rpcUrl]) =>
      readAuctionPaymentTokenLocked(new Server(rpcUrl, { allowHttp: rpcUrl.startsWith('http://') }), auctionContractId),
    { revalidateOnFocus: true }
  );
}
