import { Horizon, NotFoundError, StrKey, WebAuth } from '@stellar/stellar-sdk';

import { getNetworkConfig, type NetworkConfig } from '@/config/networks';

import { AuthError } from './server';

type AuthNetwork = Pick<NetworkConfig, 'name' | 'networkPassphrase'>;

export class Sep10AccountLookupError extends Error {}

/** Preserve the existing unfunded-key sign-in policy only after an authoritative
 * account-not-found response. This proves possession of an uncreated G address,
 * NOT a guessed signer weight/threshold for an existing account. No read-error,
 * disabled-master, or insufficient-threshold fallback is permitted. */
export const SEP10_UNFUNDED_AUTH_POLICY = 'canonical-horizon-404-master-key-only' as const;

export function sep10HorizonUrl(network: AuthNetwork): string {
  const canonical = getNetworkConfig(network.name);
  if (canonical.networkPassphrase !== network.networkPassphrase) {
    throw new AuthError(
      'NETWORK_MISMATCH',
      'SEP-10 account lookup network does not match the canonical configuration.'
    );
  }
  if (canonical.name === 'public') return 'https://horizon.stellar.org';
  if (canonical.name === 'testnet') return 'https://horizon-testnet.stellar.org';
  // The canonical local standalone stack serves Horizon at its origin. Never
  // take a Horizon URL or RPC URL from a request, wallet, or authentication proof.
  return new URL(canonical.rpcUrl).origin;
}

function byte(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 255;
}

function accountNotFound(error: unknown): boolean {
  if (!(error instanceof NotFoundError) || error.response?.status !== 404) return false;
  // A proxy/RPC-only local endpoint can return 404 too. Only Horizon's
  // account lookup problem response establishes absence, not a generic 404.
  const response = error.response as { status?: unknown; type?: unknown; data?: { status?: unknown; type?: unknown } };
  const problem = response.data ?? response;
  return problem.status === 404 && problem.type === 'https://stellar.org/horizon-errors/not_found';
}

export async function verifySep10AccountProof(proof: {
  signedTxXdr: string;
  serverAddress: string;
  accountAddress: string;
  network: AuthNetwork;
  homeDomain: string;
  webAuthDomain: string;
}): Promise<'existing-account' | 'unfunded-key'> {
  if (!StrKey.isValidEd25519PublicKey(proof.accountAddress))
    throw new AuthError('INVALID_MESSAGE', 'Invalid SEP-10 account address.');
  const horizonUrl = sep10HorizonUrl(proof.network);
  const horizon = new Horizon.Server(horizonUrl, { allowHttp: proof.network.name === 'local' });
  let account: Horizon.AccountResponse;
  try {
    account = await horizon.loadAccount(proof.accountAddress);
  } catch (error) {
    if (accountNotFound(error)) {
      try {
        WebAuth.verifyChallengeTxSigners(
          proof.signedTxXdr,
          proof.serverAddress,
          proof.network.networkPassphrase,
          [proof.accountAddress],
          proof.homeDomain,
          proof.webAuthDomain
        );
      } catch {
        throw new AuthError('INVALID_SIGNATURE', 'Unfunded-address authentication requires its master-key signature.');
      }
      return 'unfunded-key';
    }
    throw new Sep10AccountLookupError('Current Stellar account signers could not be read. Please retry.');
  }
  const mediumThreshold = account?.thresholds?.med_threshold;
  if (
    !account ||
    account.account_id !== proof.accountAddress ||
    !byte(mediumThreshold) ||
    !Array.isArray(account.signers)
  ) {
    throw new Sep10AccountLookupError(
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
      throw new Sep10AccountLookupError('Invalid current signer response. Authentication is unavailable.');
    }
    keys.add(signer.key);
  }
  try {
    // WebAuth verifies actual signatures (not hints), excludes the server signer,
    // and counts each account signer once at its current weight. A zero medium
    // threshold still requires positive client weight: a disabled master is not
    // an authentication credential, even when account transaction thresholds are 0.
    WebAuth.verifyChallengeTxThreshold(
      proof.signedTxXdr,
      proof.serverAddress,
      proof.network.networkPassphrase,
      Math.max(1, mediumThreshold),
      account.signers,
      proof.homeDomain,
      proof.webAuthDomain
    );
  } catch {
    throw new AuthError('INVALID_SIGNATURE', 'Current account signatures do not meet the authentication threshold.');
  }
  return 'existing-account';
}
