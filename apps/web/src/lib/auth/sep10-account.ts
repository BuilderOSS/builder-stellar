import { WebAuth } from '@stellar/stellar-sdk';

import type { NetworkConfig } from '@/config/networks';

import { accountNotFound, authHorizonUrl, loadCurrentAccount, requiredSignInWeight } from './account-signers';
import { AuthError } from './server';

type AuthNetwork = Pick<NetworkConfig, 'name' | 'networkPassphrase'>;

/** The Horizon helpers under the names the upload checks import. */
export { accountNotFound, authHorizonUrl as sep10HorizonUrl };

/** Preserve the existing unfunded-key sign-in policy only after an authoritative
 * account-not-found response. This proves possession of an uncreated G address,
 * NOT a guessed signer weight/threshold for an existing account. No read-error,
 * disabled-master, or insufficient-threshold fallback is permitted. */
export const SEP10_UNFUNDED_AUTH_POLICY = 'canonical-horizon-404-master-key-only' as const;

/**
 * The account rule for SEP-10 sign-in: the signed challenge's signatures, from the account's
 * current signers at their current weights, must reach requiredSignInWeight. An address with no
 * account yet (Horizon's authoritative not-found answer) needs its own key's signature. Throws
 * AccountLookupError when Horizon can't be read.
 */
export async function verifySep10AccountProof(proof: {
  signedTxXdr: string;
  serverAddress: string;
  accountAddress: string;
  network: AuthNetwork;
  homeDomain: string;
  webAuthDomain: string;
}): Promise<'existing-account' | 'unfunded-key'> {
  const account = await loadCurrentAccount(proof.accountAddress, proof.network);
  if (!account.exists) {
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
  try {
    // WebAuth verifies actual signatures (not hints), excludes the server signer,
    // and counts each account signer once at its current weight.
    WebAuth.verifyChallengeTxThreshold(
      proof.signedTxXdr,
      proof.serverAddress,
      proof.network.networkPassphrase,
      requiredSignInWeight(account),
      account.signers,
      proof.homeDomain,
      proof.webAuthDomain
    );
  } catch {
    throw new AuthError('INVALID_SIGNATURE', 'Current account signatures do not meet the authentication threshold.');
  }
  return 'existing-account';
}
