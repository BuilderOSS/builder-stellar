import { createHmac, timingSafeEqual } from 'node:crypto';

import type { UploadAuthorization } from './pinata-upload';

/**
 * Warm-process cache for upload permissions. The signed token is the source of truth,
 * so completion also works when requests land on different server instances.
 */
const authorizationStore = new Map<string, { authorization: UploadAuthorization; expiresAt: number }>();

function getSigningSecret(): string {
  const secret = process.env.IRON_PASSWORD;
  if (!secret) throw new Error('IRON_PASSWORD is required for upload authorization signing');
  return secret;
}

function sign(payload: string): string {
  return createHmac('sha256', getSigningSecret()).update(payload).digest('base64url');
}

function encodeAuthorization(authorization: UploadAuthorization): string {
  const payload = Buffer.from(
    JSON.stringify({
      uploadType: authorization.uploadType,
      expectedMimes: authorization.expectedMimes,
      maxBytes: authorization.maxBytes,
      expiresAt: authorization.expiresAt.toISOString()
    })
  ).toString('base64url');

  return `${payload}.${sign(payload)}`;
}

/**
 * Store an authorization and clean up expired ones
 */
export function storeAuthorization(_uploadId: string, authorization: UploadAuthorization): string {
  // Clean up expired authorizations
  const now = Date.now();
  for (const [id, record] of authorizationStore.entries()) {
    if (record.expiresAt < now) {
      authorizationStore.delete(id);
    }
  }

  const token = encodeAuthorization(authorization);
  const storedAuthorization = {
    ...authorization,
    uploadId: token
  };

  authorizationStore.set(token, {
    authorization: storedAuthorization,
    expiresAt: authorization.expiresAt.getTime()
  });

  return token;
}

/**
 * Retrieve a stored authorization
 */
export function getAuthorization(uploadId: string): UploadAuthorization | null {
  const record = authorizationStore.get(uploadId);
  if (record) {
    if (record.expiresAt < Date.now()) {
      authorizationStore.delete(uploadId);
      return null;
    }

    return record.authorization;
  }

  const [payload, providedSignature] = uploadId.split('.');
  if (!payload || !providedSignature) return null;

  const expectedSignature = sign(payload);
  const provided = Buffer.from(providedSignature);
  const expected = Buffer.from(expectedSignature);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;

  let parsed: {
    uploadType: UploadAuthorization['uploadType'];
    expectedMimes: string[];
    maxBytes: number;
    expiresAt: string;
  };

  try {
    parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  const expiresAt = new Date(parsed.expiresAt);
  if (
    !Number.isFinite(expiresAt.getTime()) ||
    !['dao-image', 'artwork-directory'].includes(parsed.uploadType) ||
    !Array.isArray(parsed.expectedMimes) ||
    parsed.expectedMimes.length === 0 ||
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
    expectedMimes: parsed.expectedMimes,
    maxBytes: parsed.maxBytes
  };
}
