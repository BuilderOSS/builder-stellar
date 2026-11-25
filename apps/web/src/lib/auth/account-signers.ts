import { Horizon, NotFoundError, StrKey } from '@stellar/stellar-sdk';

import { getNetworkConfig, type NetworkConfig } from '@/config/networks';

import { AuthError } from './server';

type AuthNetwork = Pick<NetworkConfig, 'name' | 'networkPassphrase'>;

/** How long sign-in waits for Horizon before it reports the account as unreadable. */
export const ACCOUNT_LOOKUP_TIMEOUT_MS = 8_000;

/**
 * Horizon could not give a trustworthy answer about an account's signers (an outage, a timeout or
 * a malformed response). Sign-in refuses with 503; it never treats this as "no account".
 */
export class AccountLookupError extends Error {
  constructor(message = 'Current Stellar account signers could not be read. Try again.') {
    super(message);
    this.name = 'AccountLookupError';
  }
}

export type AccountSigner = { key: string; type: string; weight: number };

/** An account's current signers on the deployment's network, or the authoritative fact that it has none. */
export type CurrentAccount = { exists: false } | { exists: true; mediumThreshold: number; signers: AccountSigner[] };

/** The canonical Horizon for the deployment's network. Never taken from a request, wallet or proof. */
export function authHorizonUrl(network: AuthNetwork): string {
  const canonical = getNetworkConfig(network.name);
  if (canonical.networkPassphrase !== network.networkPassphrase) {
    throw new AuthError('NETWORK_MISMATCH', 'Account lookup network does not match the canonical configuration.');
  }
  if (canonical.name === 'public') return 'https://horizon.stellar.org';
  if (canonical.name === 'testnet') return 'https://horizon-testnet.stellar.org';
  // The canonical local standalone stack serves Horizon at its origin.
  return new URL(canonical.rpcUrl).origin;
}

function byte(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 255;
}

/**
 * Whether a lookup error is Horizon's own account-not-found problem. A proxy or an RPC-only local
 * endpoint can return a bare 404 too, and that must not count as "the account doesn't exist".
 */
export function accountNotFound(error: unknown): boolean {
  if (!(error instanceof NotFoundError) || error.response?.status !== 404) return false;
  const response = error.response as { status?: unknown; type?: unknown; data?: { status?: unknown; type?: unknown } };
  const problem = response.data ?? response;
  return problem.status === 404 && problem.type === 'https://stellar.org/horizon-errors/not_found';
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Horizon lookup timed out')), ms);
    })
  ]).finally(() => clearTimeout(timer));
}

/**
 * Read `address`'s current medium threshold and signers from canonical Horizon. Returns
 * `{ exists: false }` only on Horizon's authoritative not-found answer; any other failure, and any
 * response that is not a well-formed record for exactly this account, throws AccountLookupError.
 */
export async function loadCurrentAccount(address: string, network: AuthNetwork): Promise<CurrentAccount> {
  if (!StrKey.isValidEd25519PublicKey(address)) throw new AuthError('INVALID_MESSAGE', 'Invalid account address.');
  const horizonUrl = authHorizonUrl(network);
  const horizon = new Horizon.Server(horizonUrl, { allowHttp: network.name === 'local' });
  let account: Horizon.AccountResponse;
  try {
    account = await withTimeout(horizon.loadAccount(address), ACCOUNT_LOOKUP_TIMEOUT_MS);
  } catch (error) {
    if (accountNotFound(error)) return { exists: false };
    throw new AccountLookupError();
  }

  const mediumThreshold = account?.thresholds?.med_threshold;
  if (!account || account.account_id !== address || !byte(mediumThreshold) || !Array.isArray(account.signers)) {
    throw new AccountLookupError(
      'Invalid account identity, threshold, or signer response. Authentication is unavailable.'
    );
  }
  const keys = new Set<string>();
  for (const signer of account.signers) {
    if (
      !signer ||
      typeof signer.key !== 'string' ||
      typeof signer.type !== 'string' ||
      !byte(signer.weight) ||
      keys.has(signer.key) ||
      (signer.type === 'ed25519_public_key') !== StrKey.isValidEd25519PublicKey(signer.key)
    ) {
      throw new AccountLookupError('Invalid current signer response. Authentication is unavailable.');
    }
    keys.add(signer.key);
  }
  return { exists: true, mediumThreshold, signers: account.signers };
}

/**
 * The weight sign-in requires: the account's medium threshold, and never less than 1, so a key with
 * weight 0 (a disabled master key) is never enough, even on an account whose thresholds are 0.
 */
export function requiredSignInWeight(account: { mediumThreshold: number }) {
  return Math.max(1, account.mediumThreshold);
}

/**
 * The account rule for SEP-53 sign-in. A SEP-53 signature proves only that the caller holds the
 * address's own (master) key. If the account exists, that key must still carry the weight sign-in
 * requires (requiredSignInWeight), the same rule SEP-10 applies to its signers: an account that
 * disabled its master key or moved to other signers can't sign in with the old key. An address with
 * no account yet has no signer but its own key, so the signature alone is accepted, as before; that
 * session proves key possession, not funding.
 */
export async function verifySep53SignerWeight(
  address: string,
  network: AuthNetwork
): Promise<'existing-account' | 'unfunded-key'> {
  const account = await loadCurrentAccount(address, network);
  if (!account.exists) return 'unfunded-key';
  const master = account.signers.find((signer) => signer.key === address && signer.type === 'ed25519_public_key');
  if ((master?.weight ?? 0) < requiredSignInWeight(account)) {
    throw new AuthError(
      'INSUFFICIENT_SIGNER_WEIGHT',
      "This account's own key doesn't have enough signing weight on the account, so it can't sign in."
    );
  }
  return 'existing-account';
}
