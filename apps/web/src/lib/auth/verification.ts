import { Keypair, StrKey } from '@stellar/stellar-sdk';

import { createAuthMessage } from './message';
import { AUTH_CHALLENGE_TTL_MS, AuthError } from './server';
import type { AuthSession } from './types';

type VerifyAuthInput = {
  address: string;
  message: string;
  signature: string;
  session: AuthSession;
  appName: string;
  network: { name: string; label: string; networkPassphrase: string };
  domain: string;
  uri: string;
};

function assertChallenge(session: AuthSession) {
  if (!session.challenge) {
    throw new AuthError('NO_CHALLENGE', 'Authentication challenge is missing or already consumed.');
  }
  if (session.challenge.method !== 'sep53') {
    throw new AuthError('INVALID_MESSAGE', 'Authentication challenge type is invalid.');
  }

  const issuedAt = Date.parse(session.challenge.issuedAt);
  const expiresAt = Date.parse(session.challenge.expiresAt);
  const now = Date.now();
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || issuedAt > now || expiresAt <= now) {
    throw new AuthError('CHALLENGE_EXPIRED', 'Authentication challenge has expired.');
  }

  if (expiresAt - issuedAt <= 0 || expiresAt - issuedAt > AUTH_CHALLENGE_TTL_MS) {
    throw new AuthError('INVALID_MESSAGE', 'Authentication challenge lifetime is invalid.');
  }

  return session.challenge;
}

function assertSignatureEncoding(signature: string) {
  const hex = signature.replace(/^0x/, '');
  if (/^[0-9a-fA-F]{128}$/.test(hex)) {
    return Buffer.from(hex, 'hex');
  }

  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(signature) || signature.length % 4 !== 0) {
    throw new AuthError('INVALID_SIGNATURE', 'Signature format is invalid.');
  }

  const decoded = Buffer.from(signature, 'base64');
  if (decoded.length !== 64) {
    throw new AuthError('INVALID_SIGNATURE', 'Signature format is invalid.');
  }
  return decoded;
}

export function verifyAuthProof(input: VerifyAuthInput) {
  const challenge = assertChallenge(input.session);
  let validAddress = false;
  try {
    validAddress = StrKey.isValidEd25519PublicKey(input.address);
  } catch {
    validAddress = false;
  }
  if (!validAddress) {
    throw new AuthError('INVALID_MESSAGE', 'Wallet address is invalid.');
  }

  if (challenge.network !== input.network.name) {
    throw new AuthError('NETWORK_MISMATCH', 'Authentication network does not match this deployment.');
  }

  if (challenge.domain !== input.domain || challenge.uri !== input.uri) {
    throw new AuthError('DOMAIN_MISMATCH', 'Authentication origin does not match this deployment.');
  }

  if (challenge.address !== input.address) {
    throw new AuthError('INVALID_MESSAGE', 'Authentication wallet does not match the challenge.');
  }

  const unsignedMessage = createAuthMessage({
    appName: input.appName,
    address: input.address,
    domain: input.domain,
    uri: input.uri,
    network: input.network.label,
    nonce: challenge.nonce,
    issuedAt: challenge.issuedAt,
    expirationTime: challenge.expiresAt
  });
  const serverSignature = assertSignatureEncoding(challenge.serverSignature);
  let validServerSignature = false;
  try {
    validServerSignature = Keypair.fromPublicKey(challenge.serverPublicKey).verifyMessage(
      unsignedMessage,
      serverSignature
    );
  } catch {
    validServerSignature = false;
  }
  if (!validServerSignature) {
    throw new AuthError('INVALID_SIGNATURE', 'Server authentication signature could not be verified.');
  }

  const expectedMessage = createAuthMessage({
    appName: input.appName,
    address: input.address,
    domain: input.domain,
    uri: input.uri,
    network: input.network.label,
    nonce: challenge.nonce,
    issuedAt: challenge.issuedAt,
    expirationTime: challenge.expiresAt,
    serverPublicKey: challenge.serverPublicKey,
    serverSignature: challenge.serverSignature
  });

  if (input.message !== expectedMessage) {
    throw new AuthError('INVALID_MESSAGE', 'Authentication message is invalid.');
  }

  const signature = assertSignatureEncoding(input.signature);
  let valid = false;
  try {
    valid = Keypair.fromPublicKey(input.address).verifyMessage(input.message, signature);
  } catch {
    valid = false;
  }

  if (!valid) {
    throw new AuthError('INVALID_SIGNATURE', 'Wallet signature could not be verified.');
  }

  return { address: input.address, network: input.network.name };
}
