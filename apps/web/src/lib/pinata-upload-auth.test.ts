import { afterEach, describe, expect, it } from 'vitest';

import { createUploadAuthorization } from './pinata-upload';
import { getAuthorization, storeAuthorization } from './pinata-upload-auth';

const originalSecret = process.env.IRON_PASSWORD;

afterEach(() => {
  if (originalSecret === undefined) delete process.env.IRON_PASSWORD;
  else process.env.IRON_PASSWORD = originalSecret;
});

describe('upload authorization tokens', () => {
  it('can be verified without the in-memory cache', () => {
    process.env.IRON_PASSWORD = 'test-upload-secret';

    const authorization = createUploadAuthorization('dao-image', 'https://uploads.example/sign');
    const uploadId = storeAuthorization(authorization.uploadId, authorization);

    const cached = getAuthorization(uploadId);
    expect(cached?.uploadId).toBe(uploadId);

    const reloaded = getAuthorization(uploadId);
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
    const uploadId = storeAuthorization(authorization.uploadId, authorization);

    expect(getAuthorization(`${uploadId}tampered`)).toBeNull();
  });
});
