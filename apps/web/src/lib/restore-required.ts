/**
 * Archived member state (docs/TTL_ECONOMICS.md): OpenZeppelin and the asset
 * contract renew a member's ownership, balance and vote records only 30 days
 * per touch, so a member who has not acted for a while may need them restored
 * before their next transaction. Restoring is one extra signature and a small
 * fee; the member pays it, as for any transaction.
 *
 * Server-prepared flows throw `RestoreRequiredError` with an unsigned
 * `RestoreFootprint` for the member; the route returns it with status 409; the
 * client signs and submits it, then prepares again (see
 * `lib/restore-archived-client.ts`).
 */
import type { contract } from '@stellar/stellar-sdk';
import { Account, Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import { Api } from '@stellar/stellar-sdk/rpc';

export type RestorePayload = {
  /** Unsigned RestoreFootprint transaction (base64 XDR) for the member's account. */
  xdr: string;
  /** Its maximum fee in stroops. */
  fee: string;
};

export const RESTORE_MESSAGE =
  'Some of your on-chain records were archived after a quiet stretch. Restore them first (one extra signature), then continue.';

export class RestoreRequiredError extends Error {
  readonly status = 409;
  constructor(readonly restore: RestorePayload) {
    super(RESTORE_MESSAGE);
    this.name = 'RestoreRequiredError';
  }
}

/** The JSON a prepare route returns for it. */
export function restoreResponseBody(error: RestoreRequiredError) {
  return { code: 'restore-required', message: error.message, restore: error.restore };
}

/** Rebuild the error from a prepare route's error body, if that is what it was. */
export function restoreFromBody(body: unknown): RestoreRequiredError | null {
  const value = body as { code?: unknown; restore?: { xdr?: unknown; fee?: unknown } } | null;
  if (value?.code !== 'restore-required' || typeof value.restore?.xdr !== 'string') return null;
  return new RestoreRequiredError({ xdr: value.restore.xdr, fee: String(value.restore.fee ?? '0') });
}

/**
 * Throw `RestoreRequiredError` when the assembled transaction's simulation
 * needs archived entries restored. The restore uses the transaction's own
 * source and sequence, and the resources the simulation's restore preamble
 * priced, so it needs no second simulation.
 */
export function throwIfRestoreNeeded(tx: contract.AssembledTransaction<unknown>) {
  const simulation = tx.simulation;
  if (!simulation || !Api.isSimulationRestore(simulation) || !tx.built) return;
  const networkPassphrase = tx.options.networkPassphrase;
  const built = tx.built;
  if (!('source' in built)) return;
  const { transactionData, minResourceFee } = simulation.restorePreamble;
  const account = new Account(built.source, (BigInt(built.sequence) - 1n).toString());
  const restore = new TransactionBuilder(account, { fee: '100', networkPassphrase })
    .setSorobanData(transactionData.setResourceFee(BigInt(minResourceFee)).build())
    .addOperation(Operation.restoreFootprint({}))
    .setTimeout(180)
    .build();
  throw new RestoreRequiredError({ xdr: restore.toXDR(), fee: restore.fee });
}
