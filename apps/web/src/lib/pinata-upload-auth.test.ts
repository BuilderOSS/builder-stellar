import { createHmac } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createUploadAuthorization } from './pinata-upload';
import {
  getAuthorization,
  issuePinToken,
  PIN_TOKEN_TTL_MS,
  readPinToken,
  storeAuthorization,
  verifyPinToken
} from './pinata-upload-auth';

const originalSecret = process.env.IRON_PASSWORD;
const originalUploadSecret = process.env.UPLOAD_TOKEN_SECRET;
const ALICE = 'GALICE';
const BOB = 'GBOB';
const SESSION_SECRET = 'test-session-secret-0123456789abcdef';
const OTHER_SESSION_SECRET = 'another-session-secret-0123456789abcd';
const UPLOAD_SECRET = 'test-upload-token-secret-0123456789ab';

/** The module as a different server instance loads it: an empty in-memory store. */
async function otherInstance() {
  vi.resetModules();
  return import('./pinata-upload-auth');
}

afterEach(() => {
  if (originalSecret === undefined) delete process.env.IRON_PASSWORD;
  else process.env.IRON_PASSWORD = originalSecret;
  if (originalUploadSecret === undefined) delete process.env.UPLOAD_TOKEN_SECRET;
  else process.env.UPLOAD_TOKEN_SECRET = originalUploadSecret;
});

/** A pin token signed the way tokens were signed before UPLOAD_TOKEN_SECRET existed. */
function legacyPinToken(sessionSecret: string, address: string, expiresAt: number) {
  const payload = Buffer.from(JSON.stringify({ kind: 'pin', address, expiresAt })).toString('base64url');
  const key = createHmac('sha256', sessionSecret).update('tribes-upload-token-v1').digest();
  return `${payload}.${createHmac('sha256', key).update(payload).digest('base64url')}`;
}

describe('upload authorization tokens', () => {
  it('can be verified without the in-memory cache', () => {
    process.env.IRON_PASSWORD = SESSION_SECRET;

    const authorization = createUploadAuthorization('dao-image', 'https://uploads.example/sign');
    const uploadId = storeAuthorization(authorization.uploadId, authorization, ALICE);

    const cached = getAuthorization(uploadId, ALICE);
    expect(cached?.uploadId).toBe(uploadId);

    const reloaded = getAuthorization(uploadId, ALICE);
    expect(reloaded).toMatchObject({
      uploadId,
      uploadType: 'dao-image',
      expectedMimes: ['image/png', 'image/jpeg', 'image/webp'],
      maxBytes: 5 * 1024 * 1024
    });
  });

  it('rejects tampered authorization tokens', () => {
    process.env.IRON_PASSWORD = SESSION_SECRET;

    const authorization = createUploadAuthorization('dao-image', 'https://uploads.example/sign');
    const uploadId = storeAuthorization(authorization.uploadId, authorization, ALICE);

    expect(getAuthorization(`${uploadId}tampered`, ALICE)).toBeNull();
  });

  it('only completes for the account it was issued to, cached or not', async () => {
    process.env.IRON_PASSWORD = SESSION_SECRET;
    const authorization = createUploadAuthorization('dao-image', 'https://uploads.example/sign');
    const uploadId = storeAuthorization(authorization.uploadId, authorization, ALICE);
    expect(getAuthorization(uploadId, BOB)).toBeNull();

    // Another server instance: only the signed token is available.
    const fresh = await otherInstance();
    expect(fresh.getAuthorization(uploadId, BOB)).toBeNull();
    expect(fresh.getAuthorization(uploadId, ALICE)?.uploadType).toBe('dao-image');
    process.env.IRON_PASSWORD = OTHER_SESSION_SECRET;
    expect(fresh.getAuthorization(uploadId, ALICE)).toBeNull();
  });

  it('decodes every upload type from the signature, a claim list included', async () => {
    process.env.IRON_PASSWORD = SESSION_SECRET;
    const authorization = createUploadAuthorization('claim-list', 'https://uploads.example/sign');
    const uploadId = storeAuthorization(authorization.uploadId, authorization, ALICE);
    const fresh = await otherInstance();
    expect(fresh.getAuthorization(uploadId, ALICE)?.uploadType).toBe('claim-list');
  });
});

describe('pin tokens', () => {
  it('pin only for their account and only until they expire', () => {
    process.env.IRON_PASSWORD = SESSION_SECRET;
    const now = 1_000_000;
    const token = issuePinToken(ALICE, now);

    expect(verifyPinToken(token, ALICE, now + 1)).toBe(true);
    expect(verifyPinToken(token, BOB, now + 1)).toBe(false);
    expect(verifyPinToken(token, ALICE, now + PIN_TOKEN_TTL_MS)).toBe(false);
    expect(verifyPinToken(`${token}x`, ALICE, now + 1)).toBe(false);
  });

  it('name the Pinata key they came with, under the signature', () => {
    process.env.IRON_PASSWORD = SESSION_SECRET;
    const now = 1_000_000;
    const token = issuePinToken(ALICE, now, 'key-1');
    expect(readPinToken(token, ALICE, now + 1)).toEqual({ keyId: 'key-1' });
    expect(readPinToken(token, BOB, now + 1)).toBeNull();
    expect(readPinToken(issuePinToken(ALICE, now), ALICE, now + 1)).toEqual({ keyId: null });

    // Naming another key in the payload breaks the signature, so a client can't revoke a key it wasn't given.
    const [payload, signature] = token.split('.');
    const swapped = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(payload!, 'base64url').toString('utf8')), key: 'key-2' })
    ).toString('base64url');
    expect(readPinToken(`${swapped}.${signature}`, ALICE, now + 1)).toBeNull();
  });

  it('are not upload tokens, and upload tokens are not pin tokens', () => {
    process.env.IRON_PASSWORD = SESSION_SECRET;
    const authorization = createUploadAuthorization('dao-image', 'https://uploads.example/sign');
    const uploadId = storeAuthorization(authorization.uploadId, authorization, ALICE);

    expect(verifyPinToken(uploadId, ALICE)).toBe(false);
    expect(getAuthorization(issuePinToken(ALICE), ALICE)).toBeNull();
  });
});

describe('upload token signing key', () => {
  it('without UPLOAD_TOKEN_SECRET, uses the key derived from the session secret, as before', () => {
    delete process.env.UPLOAD_TOKEN_SECRET;
    process.env.IRON_PASSWORD = SESSION_SECRET;
    const now = 1_000_000;
    expect(verifyPinToken(legacyPinToken(SESSION_SECRET, ALICE, now + 1000), ALICE, now)).toBe(true);
  });

  it('with a rotated session secret map, derives from the highest-numbered secret', () => {
    delete process.env.UPLOAD_TOKEN_SECRET;
    process.env.IRON_PASSWORD = JSON.stringify({ 1: SESSION_SECRET, 2: OTHER_SESSION_SECRET });
    const now = 1_000_000;
    expect(verifyPinToken(legacyPinToken(OTHER_SESSION_SECRET, ALICE, now + 1000), ALICE, now)).toBe(true);
    expect(verifyPinToken(legacyPinToken(SESSION_SECRET, ALICE, now + 1000), ALICE, now)).toBe(false);
  });

  it('with UPLOAD_TOKEN_SECRET, signs with it alone, so the session secret can rotate on its own', () => {
    process.env.UPLOAD_TOKEN_SECRET = UPLOAD_SECRET;
    process.env.IRON_PASSWORD = SESSION_SECRET;
    const now = 1_000_000;
    const token = issuePinToken(ALICE, now);
    expect(verifyPinToken(token, ALICE, now + 1)).toBe(true);
    // A token signed with the session-derived key is no longer accepted.
    expect(verifyPinToken(legacyPinToken(SESSION_SECRET, ALICE, now + 1000), ALICE, now)).toBe(false);

    process.env.IRON_PASSWORD = OTHER_SESSION_SECRET;
    expect(verifyPinToken(token, ALICE, now + 1)).toBe(true);

    process.env.UPLOAD_TOKEN_SECRET = `${UPLOAD_SECRET}-rotated`;
    expect(verifyPinToken(token, ALICE, now + 1)).toBe(false);
  });

  it('refuses a short UPLOAD_TOKEN_SECRET instead of signing with it', () => {
    process.env.UPLOAD_TOKEN_SECRET = 'too-short';
    process.env.IRON_PASSWORD = SESSION_SECRET;
    expect(() => issuePinToken(ALICE)).toThrow('UPLOAD_TOKEN_SECRET must be at least 32 characters.');
  });
});
