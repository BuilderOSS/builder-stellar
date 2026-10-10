import { TransactionBuilder } from '@stellar/stellar-sdk';
import type { AssembledTransaction } from '@stellar/stellar-sdk/contract';
import type { Server } from '@stellar/stellar-sdk/rpc';

import { decimalToStroops, formatStroops } from '@/lib/auction-values';
import { type DraftConfiguration, draftConfigurationSchema } from '@/lib/create-dao-schema';
import { assertMarketplaceTransaction, assertUnchangedMarketplaceEnvelope } from '@/lib/marketplace/transaction';
import type { SignedSubmission, SubmissionStatus } from '@/stores/create-dao-store';

export type RecoveryOptions = { rebroadcast?: boolean };
export type Submission = SignedSubmission & { status?: SubmissionStatus | 'prepared'; error?: string };
type SubmissionUpdate = Partial<SignedSubmission> & { status?: SubmissionStatus; error?: string };
export class SubmissionNotAccepted extends Error {}
export class SubmissionExpired extends Error {}
export class SubmissionFailed extends Error {}

export function normalizedCreationConfiguration(value: unknown): DraftConfiguration {
  const config = draftConfigurationSchema.parse(value);
  return {
    ...config,
    auction: { ...config.auction, reservePrice: formatStroops(decimalToStroops(config.auction.reservePrice)!) }
  };
}
export function creationConfigurationFingerprint(value: unknown): string {
  // Schema parsing fixes field order, strips unrelated fields (including launchAdmin),
  // trims identity text and normalizes exact amounts. No floating-point conversion.
  return JSON.stringify(normalizedCreationConfiguration(value));
}
export function preparedCreationXdr<T>(transaction: AssembledTransaction<T>): string {
  void transaction.simulationData;
  if (transaction.needsNonInvokerSigningBy().some((address) => address.startsWith('G')))
    throw new Error('This action unexpectedly requires another account signature. Nothing was submitted.');
  return transaction.toXdr();
}
export function bindSignedCreationEnvelope(
  requestedXdr: string,
  signedTxXdr: string,
  passphrase: string,
  actor: string
) {
  const requested = TransactionBuilder.fromXDR(requestedXdr, passphrase);
  const signed = TransactionBuilder.fromXDR(signedTxXdr, passphrase);
  assertMarketplaceTransaction(requested, actor);
  const hash = assertUnchangedMarketplaceEnvelope(requested, signed);
  assertMarketplaceTransaction(signed, actor);
  if (!('timeBounds' in signed)) throw new Error('Unexpected signed transaction envelope type');
  const expiresAt = Number(signed.timeBounds?.maxTime);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= 0) throw new Error('A finite envelope expiry is required');
  return { hash, signedTxXdr, expiresAt };
}
export function storedCreationEnvelope(receipt: Submission, passphrase: string, actor: string) {
  if (!receipt.signedTxXdr || !receipt.hash || !receipt.expiresAt)
    throw new Error(
      'This older receipt has no saved envelope/expiry. Check its transaction or Manager state; it cannot be safely rebroadcast.'
    );
  const envelope = TransactionBuilder.fromXDR(receipt.signedTxXdr, passphrase);
  const hash = assertUnchangedMarketplaceEnvelope(envelope, envelope);
  if (
    !('source' in envelope) ||
    envelope.source !== actor ||
    hash !== receipt.hash ||
    Number(envelope.timeBounds?.maxTime) !== receipt.expiresAt
  )
    throw new Error('The saved signed envelope does not match its hash, actor, or expiry. Nothing was submitted.');
  return envelope;
}

export async function broadcastCreationEnvelope(
  server: Pick<Server, 'sendTransaction'>,
  receipt: Submission,
  passphrase: string,
  actor: string,
  save: (changes: SubmissionUpdate) => void
) {
  const envelope = storedCreationEnvelope(receipt, passphrase, actor);
  assertMarketplaceTransaction(envelope, actor);
  // The caller has explicitly requested this transmission. Reuse the exact signed
  // bytes; never call the wallet, refresh the sequence, or alter fees on rebroadcast.
  const response = await server.sendTransaction(envelope);
  if (response.hash !== receipt.hash)
    throw new Error('RPC returned a different transaction hash. Acceptance is unknown.');
  if (response.status === 'PENDING' || response.status === 'DUPLICATE') {
    save({ status: 'submitted', acceptedAt: receipt.acceptedAt ?? Date.now(), error: undefined });
    return;
  }
  if (response.status === 'ERROR') {
    // A previously accepted envelope cannot be downgraded by a later rejection
    // from another node. Keep checking its original hash until chain reconciliation.
    if (!receipt.acceptedAt && receipt.status !== 'submitted') save({ status: 'rejected' });
    throw new SubmissionNotAccepted(
      'RPC rejected the envelope. Check the saved transaction and Manager state before retrying the same action.'
    );
  }
  if (response.status === 'TRY_AGAIN_LATER')
    throw new SubmissionNotAccepted(
      'RPC did not accept the envelope. Its signed bytes are saved; explicitly rebroadcast them while valid.'
    );
  throw new Error('Transaction acceptance is unknown. The signed envelope is saved.');
}

export async function inspectCreationSubmission(
  server: Pick<Server, 'getTransaction'>,
  receipt: Submission,
  passphrase: string,
  actor: string
): Promise<'confirmed' | 'failed' | 'expired' | 'pending'> {
  if (!receipt.hash) return 'pending';
  if (receipt.signedTxXdr) storedCreationEnvelope(receipt, passphrase, actor);
  const response = await server.getTransaction(receipt.hash);
  if (response.status === 'SUCCESS') return 'confirmed';
  if (response.status === 'FAILED') return 'failed';
  // Use RPC's indexed ledger close time, not just the browser clock. A slow ledger
  // may still include an accepted transaction after its wall-clock expiry.
  if (receipt.expiresAt && response.latestLedgerCloseTime > receipt.expiresAt) return 'expired';
  return 'pending';
}
