import { NotFoundError } from '@stellar/stellar-sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({ address: 'GALICE', network: 'testnet' }));

vi.mock('@/lib/auth/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/server')>()),
  requireAuthenticatedSession: vi.fn(async () => session)
}));

import {
  countUpload,
  requireUploadAccount,
  resetUploadAccessForTests,
  UPLOAD_LIMITS,
  UPLOAD_WINDOW_MS,
  UploadAccessError
} from './upload-access';

const horizonNotFound = () =>
  new NotFoundError('not found', { status: 404, type: 'https://stellar.org/horizon-errors/not_found' });

beforeEach(() => {
  resetUploadAccessForTests();
  vi.stubEnv('NEXT_PUBLIC_NETWORK', 'testnet');
  session.address = 'GALICE';
  session.network = 'testnet';
});

describe('requireUploadAccount', () => {
  it('lets a funded account upload and remembers it', async () => {
    const lookup = vi.fn(async () => ({}));
    await expect(requireUploadAccount('pinata-url', lookup)).resolves.toEqual(session);
    await requireUploadAccount('pinata-url', lookup);
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(lookup).toHaveBeenCalledWith('https://horizon-testnet.stellar.org', 'GALICE');
  });

  it('refuses an account the network has never funded, and remembers that briefly', async () => {
    const lookup = vi.fn(async () => {
      throw horizonNotFound();
    });
    for (let i = 0; i < 2; i += 1) {
      await expect(requireUploadAccount('complete', lookup)).rejects.toMatchObject({
        status: 403,
        code: 'UPLOAD_ACCOUNT_UNFUNDED'
      });
    }
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it('treats a failed lookup, or a 404 that is not Horizon’s, as unavailable, never as funded', async () => {
    for (const failure of [new Error('Horizon is down'), new NotFoundError('proxy', { status: 404 })]) {
      resetUploadAccessForTests();
      const error = await requireUploadAccount('complete', async () => {
        throw failure;
      }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(UploadAccessError);
      expect(error).toMatchObject({ status: 503, code: 'UPLOAD_ACCOUNT_LOOKUP_FAILED' });
    }
    // Nothing was remembered: the next request looks again.
    await requireUploadAccount(
      'complete',
      vi.fn(async () => ({}))
    );
  });

  it('refuses a session from another network', async () => {
    session.network = 'public';
    await expect(requireUploadAccount('pinata-url', vi.fn())).rejects.toMatchObject({ code: 'NETWORK_MISMATCH' });
  });

  it('applies the route limit before looking the account up', async () => {
    const lookup = vi.fn(async () => {
      throw horizonNotFound();
    });
    for (let i = 0; i < UPLOAD_LIMITS['pin-cid']; i += 1) {
      await requireUploadAccount('pin-cid', lookup).catch(() => undefined);
    }
    await expect(requireUploadAccount('pin-cid', lookup)).rejects.toMatchObject({ status: 429 });
    expect(lookup).toHaveBeenCalledTimes(1);
  });
});

describe('countUpload', () => {
  it('allows a route its limit per account per window, then refuses with Retry-After', () => {
    const now = 5_000;
    for (let i = 0; i < UPLOAD_LIMITS['pin-cid']; i += 1) countUpload('pin-cid', 'GALICE', now);
    const refused = (() => {
      try {
        countUpload('pin-cid', 'GALICE', now);
      } catch (error) {
        return error;
      }
    })();
    expect(refused).toMatchObject({ status: 429, retryAfter: UPLOAD_WINDOW_MS / 1000 });
    // Another account, and another route, have their own counts.
    expect(() => countUpload('pin-cid', 'GBOB', now)).not.toThrow();
    expect(() => countUpload('complete', 'GALICE', now)).not.toThrow();
    // A new window starts afresh.
    expect(() => countUpload('pin-cid', 'GALICE', now + UPLOAD_WINDOW_MS)).not.toThrow();
  });
});
