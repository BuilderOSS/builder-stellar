import { NotFoundError } from '@stellar/stellar-sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({ address: 'GALICE', network: 'testnet' }));

vi.mock('@/lib/auth/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/server')>()),
  requireAuthenticatedSession: vi.fn(async () => session)
}));

import {
  limitUploads,
  requireUploadAccount,
  resetUploadAccessForTests,
  UPLOAD_LIMITS,
  UPLOAD_WINDOW_MS,
  UploadAccessError
} from './upload-access';

beforeEach(() => {
  resetUploadAccessForTests();
  session.address = 'GALICE';
});

describe('requireUploadAccount', () => {
  it('lets a funded account upload and remembers it', async () => {
    const lookup = vi.fn(async () => ({}));
    await expect(requireUploadAccount(lookup)).resolves.toEqual(session);
    await requireUploadAccount(lookup);
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(lookup).toHaveBeenCalledWith('https://horizon-testnet.stellar.org', 'GALICE');
  });

  it('refuses an account the network has never funded', async () => {
    const lookup = vi.fn(async () => {
      throw new NotFoundError('not found', {});
    });
    await expect(requireUploadAccount(lookup)).rejects.toMatchObject({
      status: 403,
      code: 'UPLOAD_ACCOUNT_UNFUNDED'
    });
  });

  it('treats a failed lookup as unavailable, never as funded', async () => {
    const lookup = vi.fn(async () => {
      throw new Error('Horizon is down');
    });
    const error = await requireUploadAccount(lookup).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UploadAccessError);
    expect(error).toMatchObject({ status: 503, code: 'UPLOAD_ACCOUNT_LOOKUP_FAILED' });
    // Nothing was remembered: the next request looks again.
    await requireUploadAccount(vi.fn(async () => ({})));
  });
});

describe('limitUploads', () => {
  it('allows a route its limit per account per window, then answers 429', async () => {
    const now = 5_000;
    for (let i = 0; i < UPLOAD_LIMITS['pin-cid']; i += 1) {
      expect(limitUploads('pin-cid', 'GALICE', now)).toBeNull();
    }
    const refused = limitUploads('pin-cid', 'GALICE', now);
    expect(refused?.status).toBe(429);
    expect(refused?.headers.get('Retry-After')).toBe(String(UPLOAD_WINDOW_MS / 1000));
    // Another account, and another route, have their own counts.
    expect(limitUploads('pin-cid', 'GBOB', now)).toBeNull();
    expect(limitUploads('complete', 'GALICE', now)).toBeNull();
    // A new window starts afresh.
    expect(limitUploads('pin-cid', 'GALICE', now + UPLOAD_WINDOW_MS)).toBeNull();
  });
});
