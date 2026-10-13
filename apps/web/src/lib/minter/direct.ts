'use client';

import type { AssembledTransaction } from '@stellar/stellar-sdk/contract';

import type { DaoNetworkConfig } from '@/lib/dao-config';
import { restoreArchivedState } from '@/lib/restore-archived-client';
import { waitForConfirmation } from '@/lib/transaction-confirmation';
import { signWithWallet } from '@/lib/wallet-sign';

/**
 * Bindings-client options for a call the connected wallet signs itself: the permissionless
 * claim calls (refund, launch when ready) and the launch admin's Setup calls. The wallet
 * builds and signs the exact call shown, so no server review is involved.
 */
export function walletClientOptions(config: DaoNetworkConfig, address: string, contractId: string) {
  return {
    contractId,
    rpcUrl: config.rpcUrl,
    networkPassphrase: config.passphrase,
    publicKey: address,
    allowHttp: config.name === 'local',
    ...restoreArchivedState,
    signTransaction: (xdr: string, opts?: { networkPassphrase?: string; address?: string }) =>
      signWithWallet(xdr, { ...opts, address, networkPassphrase: config.passphrase })
  };
}

type Unwrappable = { unwrap: () => unknown };

/** Fail on a simulated contract error first, then sign, submit and wait for confirmation. */
export async function sendAndConfirm<T>(assembled: AssembledTransaction<T>, rpcUrl: string) {
  const result = assembled.result as unknown;
  if (result && typeof (result as Unwrappable).unwrap === 'function') (result as Unwrappable).unwrap();
  const sent = await assembled.signAndSend();
  const hash = sent.sendTransactionResponse?.hash ?? '';
  await waitForConfirmation(hash, rpcUrl);
  return hash;
}
