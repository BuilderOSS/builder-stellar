'use client';

import { TransactionBuilder } from '@stellar/stellar-sdk';
import { Server } from '@stellar/stellar-sdk/rpc';

import { RestoreRequiredError } from '@/lib/restore-required';
import { waitForConfirmation } from '@/lib/transaction-confirmation';
import { signWithWallet } from '@/lib/wallet-sign';

/**
 * Spread into a wallet client's options (`new XClient({ ..., ...restoreArchivedState, signTransaction })`).
 * When a simulation finds archived member state, the SDK restores it first
 * (one extra wallet signature) and then retries. Not in the generated types,
 * but the SDK passes client options to every call.
 */
export const restoreArchivedState = { restore: true } as const;

/**
 * Run a server prepare; if it reports archived state, sign and submit the
 * restore it returned, wait for it, and prepare once more.
 */
export async function withArchivedRestore<T>(
  prepare: () => Promise<T>,
  context: {
    address: string;
    rpcUrl: string;
    networkPassphrase: string;
    onRestoring?: (message: string) => void;
  }
): Promise<T> {
  try {
    return await prepare();
  } catch (error) {
    if (!(error instanceof RestoreRequiredError)) throw error;
    context.onRestoring?.(
      `Restoring your archived records first (about ${(Number(error.restore.fee) / 1e7).toFixed(4)} XLM)…`
    );
    const { signedTxXdr } = await signWithWallet(error.restore.xdr, {
      address: context.address,
      networkPassphrase: context.networkPassphrase
    });
    const server = new Server(context.rpcUrl, { allowHttp: context.rpcUrl.startsWith('http://') });
    const sent = await server.sendTransaction(TransactionBuilder.fromXDR(signedTxXdr, context.networkPassphrase));
    if (sent.status === 'ERROR' || sent.status === 'TRY_AGAIN_LATER')
      throw new Error('The network did not accept the restore. Nothing else was sent.');
    await waitForConfirmation(sent.hash, context.rpcUrl);
    return prepare();
  }
}
