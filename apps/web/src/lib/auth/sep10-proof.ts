import { Transaction, TransactionBuilder, WebAuth } from '@stellar/stellar-sdk';
import { Buffer } from 'buffer';

/** Signatures change envelope XDR, not the exact transaction body/hash. */
export function matchesSep10Transaction(challengeXdr: string, signedXdr: string, passphrase: string): boolean {
  try {
    const challenge = TransactionBuilder.fromXDR(challengeXdr, passphrase);
    const signed = TransactionBuilder.fromXDR(signedXdr, passphrase);
    return (
      challenge instanceof Transaction &&
      signed instanceof Transaction &&
      Buffer.from(challenge.hash()).equals(Buffer.from(signed.hash()))
    );
  } catch {
    return false;
  }
}

/** A SEP-10 challenge failed the browser's check, so it was not sent to the wallet. */
export class Sep10ChallengeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Sep10ChallengeError';
  }
}

const INVALID_CHALLENGE =
  'The sign-in request from the server is not a valid sign-in challenge, so nothing was signed.';

function parseTransaction(xdr: string, passphrase: string): Transaction | null {
  try {
    const tx = TransactionBuilder.fromXDR(xdr, passphrase);
    return tx instanceof Transaction ? tx : null;
  } catch {
    return null;
  }
}

function signedBy(tx: Transaction, publicKey: string) {
  try {
    return WebAuth.verifyTxSignedBy(tx, publicKey);
  } catch {
    return false;
  }
}

/**
 * Checks a SEP-10 challenge in the browser before the wallet is asked to sign it, so a tampered or
 * substituted server response can't get anything but a sign-in signed. It must be a transaction on
 * this network with sequence number 0, which can never be applied on chain; from `serverPublicKey`
 * (the key that also signed this sign-in's SEP-53 message), as source and signer; with only
 * manageData operations, the first one `<homeDomain> auth` for `address`, and the rest from the
 * server key, apart from `client_domain`. Time bounds are left to the server, which enforces them,
 * so a browser with a wrong clock can still sign in. The domains come from the same server response.
 */
export function assertSignableSep10Challenge(
  xdr: string,
  expected: {
    address: string;
    networkPassphrase: string;
    serverPublicKey: string;
    homeDomain: string;
    webAuthDomain: string;
  }
) {
  const tx = parseTransaction(xdr, expected.networkPassphrase);
  if (!tx || tx.sequence !== '0' || tx.source !== expected.serverPublicKey || !signedBy(tx, expected.serverPublicKey)) {
    throw new Sep10ChallengeError(INVALID_CHALLENGE);
  }
  const [first, ...rest] = tx.operations;
  if (first?.type !== 'manageData' || first.name !== `${expected.homeDomain} auth`) {
    throw new Sep10ChallengeError(INVALID_CHALLENGE);
  }
  for (const op of rest) {
    if (
      op.type !== 'manageData' ||
      (op.name !== 'client_domain' && op.source !== expected.serverPublicKey) ||
      (op.name === 'web_auth_domain' && Buffer.from(op.value ?? []).toString('utf8') !== expected.webAuthDomain)
    ) {
      throw new Sep10ChallengeError(INVALID_CHALLENGE);
    }
  }
  if (first.source !== expected.address) {
    throw new Sep10ChallengeError('The sign-in request is for a different address, so nothing was signed.');
  }
}
