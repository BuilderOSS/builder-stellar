import { createHmac, timingSafeEqual } from 'node:crypto';

import { currentSessionPassword, MIN_SECRET_LENGTH } from './auth/secrets';
import { isValidUploadType, type UploadAuthorization } from './pinata-upload';

/**
 * Warm-process cache for upload permissions. The signed token is the source of truth,
 * so completion also works when requests land on different server instances.
 */
const authorizationStore = new Map<
  string,
  { authorization: UploadAuthorization; address: string; expiresAt: number }
>();

/** How long a pin token from `generate-jwt` lets its holder pin the directory it uploaded. */
export const PIN_TOKEN_TTL_MS = 60 * 60 * 1000;

const UPLOAD_TOKEN_KEY_LABEL = 'tribes-upload-token-v1';

/**
 * The key upload and pin tokens are signed with. UPLOAD_TOKEN_SECRET, when set, keeps upload tokens
 * apart from sessions: rotating one secret doesn't touch the other. When it is unset, the key is
 * derived from the current session secret (the highest-numbered IRON_PASSWORD) under its own label,
 * so a token and a session cookie still never share a key. Changing either secret ends the tokens
 * already issued; they last an hour at most.
 */
function getSigningKey(): Buffer {
  const dedicated = process.env.UPLOAD_TOKEN_SECRET?.trim();
  if (dedicated && dedicated.length < MIN_SECRET_LENGTH) {
    throw new Error(`UPLOAD_TOKEN_SECRET must be at least ${MIN_SECRET_LENGTH} characters.`);
  }
  const secret = dedicated || currentSessionPassword();
  return createHmac('sha256', secret).update(UPLOAD_TOKEN_KEY_LABEL).digest();
}

function sign(payload: string): string {
  return createHmac('sha256', getSigningKey()).update(payload).digest('base64url');
}

function verifySigned(token: string): unknown {
  const [payload, providedSignature, extra] = token.split('.');
  if (!payload || !providedSignature || extra !== undefined) return null;
  const provided = Buffer.from(providedSignature);
  const expected = Buffer.from(sign(payload));
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function signed(value: object): string {
  const payload = Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

function encodeAuthorization(authorization: UploadAuthorization, address: string): string {
  return signed({
    kind: 'upload',
    address,
    uploadType: authorization.uploadType,
    expectedMimes: authorization.expectedMimes,
    maxBytes: authorization.maxBytes,
    expiresAt: authorization.expiresAt.toISOString()
  });
}

/**
 * Store an authorization for `address` (the signed-in account that asked for it) and clean up
 * expired ones. Returns the token the client presents to complete the upload.
 */
export function storeAuthorization(_uploadId: string, authorization: UploadAuthorization, address: string): string {
  const now = Date.now();
  for (const [id, record] of authorizationStore.entries()) {
    if (record.expiresAt < now) {
      authorizationStore.delete(id);
    }
  }

  const token = encodeAuthorization(authorization, address);
  authorizationStore.set(token, {
    authorization: { ...authorization, uploadId: token },
    address,
    expiresAt: authorization.expiresAt.getTime()
  });

  return token;
}

/**
 * The authorization behind `uploadId`, only for the account it was issued to and only until it
 * expires. Null for a tampered, expired or someone else's token.
 */
export function getAuthorization(uploadId: string, address: string): UploadAuthorization | null {
  const record = authorizationStore.get(uploadId);
  if (record) {
    if (record.expiresAt < Date.now()) {
      authorizationStore.delete(uploadId);
      return null;
    }
    return record.address === address ? record.authorization : null;
  }

  const parsed = verifySigned(uploadId) as {
    kind?: unknown;
    address?: unknown;
    uploadType?: unknown;
    expectedMimes?: unknown;
    maxBytes?: unknown;
    expiresAt?: unknown;
  } | null;
  if (!parsed || parsed.kind !== 'upload' || parsed.address !== address) return null;

  const expiresAt = new Date(String(parsed.expiresAt));
  if (
    !Number.isFinite(expiresAt.getTime()) ||
    typeof parsed.uploadType !== 'string' ||
    !isValidUploadType(parsed.uploadType) ||
    !Array.isArray(parsed.expectedMimes) ||
    parsed.expectedMimes.length === 0 ||
    typeof parsed.maxBytes !== 'number' ||
    !Number.isFinite(parsed.maxBytes)
  ) {
    return null;
  }

  if (expiresAt.getTime() < Date.now()) {
    return null;
  }

  return {
    uploadId,
    signedUrl: '',
    expiresAt,
    uploadType: parsed.uploadType,
    expectedMimes: parsed.expectedMimes as string[],
    maxBytes: parsed.maxBytes
  };
}

/**
 * A token `generate-jwt` returns with each upload key: `pin-cid` pins only for the account it was
 * issued to, within PIN_TOKEN_TTL_MS, so a session alone can't pin arbitrary content.
 */
export function issuePinToken(address: string, now = Date.now()): string {
  return signed({ kind: 'pin', address, expiresAt: now + PIN_TOKEN_TTL_MS });
}

export function verifyPinToken(token: string, address: string, now = Date.now()): boolean {
  const parsed = verifySigned(token) as { kind?: unknown; address?: unknown; expiresAt?: unknown } | null;
  return Boolean(
    parsed &&
    parsed.kind === 'pin' &&
    parsed.address === address &&
    typeof parsed.expiresAt === 'number' &&
    parsed.expiresAt > now
  );
}
