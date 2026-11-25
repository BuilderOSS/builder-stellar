import { afterEach, describe, expect, it, vi } from 'vitest';

import { createUploadAuthorization } from './pinata-upload';
import {
  getAuthorization,
  issuePinToken,
  PIN_TOKEN_TTL_MS,
  storeAuthorization,
  verifyPinToken
} from './pinata-upload-auth';

const originalSecret = process.env.IRON_PASSWORD;
const ALICE = 'GALICE';
const BOB = 'GBOB';

/** The module as a different server instance loads it: an empty in-memory store. */
async function otherInstance() {
  vi.resetModules();
  return import('./pinata-upload-auth');
}

afterEach(() => {
  if (originalSecret === undefined) delete process.env.IRON_PASSWORD;
  else process.env.IRON_PASSWORD = originalSecret;
});

describe('upload authorization tokens', () => {
  it('can be verified without the in-memory cache', () => {
    process.env.IRON_PASSWORD = 'test-upload-secret';

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
    process.env.IRON_PASSWORD = 'test-upload-secret';

    const authorization = createUploadAuthorization('dao-image', 'https://uploads.example/sign');
    const uploadId = storeAuthorization(authorization.uploadId, authorization, ALICE);

    expect(getAuthorization(`${uploadId}tampered`, ALICE)).toBeNull();
  });

  it('only completes for the account it was issued to, cached or not', async () => {
    process.env.IRON_PASSWORD = 'test-upload-secret';
    const authorization = createUploadAuthorization('dao-image', 'https://uploads.example/sign');
    const uploadId = storeAuthorization(authorization.uploadId, authorization, ALICE);
    expect(getAuthorization(uploadId, BOB)).toBeNull();

    // Another server instance: only the signed token is available.
    const fresh = await otherInstance();
    expect(fresh.getAuthorization(uploadId, BOB)).toBeNull();
    expect(fresh.getAuthorization(uploadId, ALICE)?.uploadType).toBe('dao-image');
    process.env.IRON_PASSWORD = 'another-secret';
    expect(fresh.getAuthorization(uploadId, ALICE)).toBeNull();
  });

  it('decodes every upload type from the signature, a claim list included', async () => {
    process.env.IRON_PASSWORD = 'test-upload-secret';
    const authorization = createUploadAuthorization('claim-list', 'https://uploads.example/sign');
    const uploadId = storeAuthorization(authorization.uploadId, authorization, ALICE);
    const fresh = await otherInstance();
    expect(fresh.getAuthorization(uploadId, ALICE)?.uploadType).toBe('claim-list');
  });
});

describe('pin tokens', () => {
  it('pin only for their account and only until they expire', () => {
    process.env.IRON_PASSWORD = 'test-upload-secret';
    const now = 1_000_000;
    const token = issuePinToken(ALICE, now);

    expect(verifyPinToken(token, ALICE, now + 1)).toBe(true);
    expect(verifyPinToken(token, BOB, now + 1)).toBe(false);
    expect(verifyPinToken(token, ALICE, now + PIN_TOKEN_TTL_MS)).toBe(false);
    expect(verifyPinToken(`${token}x`, ALICE, now + 1)).toBe(false);
  });

  it('are not upload tokens, and upload tokens are not pin tokens', () => {
    process.env.IRON_PASSWORD = 'test-upload-secret';
    const authorization = createUploadAuthorization('dao-image', 'https://uploads.example/sign');
    const uploadId = storeAuthorization(authorization.uploadId, authorization, ALICE);

    expect(verifyPinToken(uploadId, ALICE)).toBe(false);
    expect(getAuthorization(issuePinToken(ALICE), ALICE)).toBeNull();
  });
});
