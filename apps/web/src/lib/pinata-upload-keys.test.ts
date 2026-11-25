import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PinataService } from './pinata-service';
import {
  resetUploadKeySweep,
  revokeUploadKeyQuietly,
  sweepExpiredUploadKeys,
  UPLOAD_KEY_SWEEP_INTERVAL_MS,
  UPLOAD_KEY_SWEEP_WAIT_MS
} from './pinata-upload-keys';

const service = (overrides: Partial<Pick<PinataService, 'revokeExpiredUploadKeys' | 'revokeUploadKey'>>) =>
  ({
    revokeExpiredUploadKeys: vi.fn(async () => 0),
    revokeUploadKey: vi.fn(async () => undefined),
    ...overrides
  }) as unknown as PinataService;

describe('sweepExpiredUploadKeys', () => {
  beforeEach(() => resetUploadKeySweep());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('sweeps at most once per interval on an instance', async () => {
    const revokeExpiredUploadKeys = vi.fn(async () => 1);
    const pinata = service({ revokeExpiredUploadKeys });
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    await sweepExpiredUploadKeys(pinata, 1_000);
    await sweepExpiredUploadKeys(pinata, 1_000 + UPLOAD_KEY_SWEEP_INTERVAL_MS - 1);
    expect(revokeExpiredUploadKeys).toHaveBeenCalledTimes(1);
    await sweepExpiredUploadKeys(pinata, 1_000 + UPLOAD_KEY_SWEEP_INTERVAL_MS);
    expect(revokeExpiredUploadKeys).toHaveBeenCalledTimes(2);
    expect(revokeExpiredUploadKeys).toHaveBeenLastCalledWith(1_000 + UPLOAD_KEY_SWEEP_INTERVAL_MS);
  });

  it('logs a failed sweep instead of failing the upload call', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const pinata = service({ revokeExpiredUploadKeys: vi.fn(async () => Promise.reject(new Error('forbidden'))) });
    await expect(sweepExpiredUploadKeys(pinata, 1_000)).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith('[pinata-upload-keys] sweep failed:', 'forbidden');
  });

  it('waits a few seconds at most for a slow sweep, and starts no second one meanwhile', async () => {
    vi.useFakeTimers();
    let finish = () => {};
    const revokeExpiredUploadKeys = vi.fn(() => new Promise<number>((resolve) => (finish = () => resolve(0))));
    const pinata = service({ revokeExpiredUploadKeys });
    let returned = false;
    const call = sweepExpiredUploadKeys(pinata, 1_000).then(() => (returned = true));
    await vi.advanceTimersByTimeAsync(UPLOAD_KEY_SWEEP_WAIT_MS - 1);
    expect(returned).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await call;
    expect(returned).toBe(true);
    await sweepExpiredUploadKeys(pinata, 1_000 + 2 * UPLOAD_KEY_SWEEP_INTERVAL_MS);
    expect(revokeExpiredUploadKeys).toHaveBeenCalledTimes(1);
    finish();
  });
});

describe('revokeUploadKeyQuietly', () => {
  afterEach(() => vi.restoreAllMocks());

  it('revokes, and logs a failure instead of throwing', async () => {
    const revokeUploadKey = vi.fn(async () => undefined);
    await expect(revokeUploadKeyQuietly('key-1', service({ revokeUploadKey }))).resolves.toBe(true);
    expect(revokeUploadKey).toHaveBeenCalledWith('key-1');

    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failing = service({ revokeUploadKey: vi.fn(async () => Promise.reject(new Error('timeout'))) });
    await expect(revokeUploadKeyQuietly('key-2', failing)).resolves.toBe(false);
    expect(error).toHaveBeenCalledWith('[pinata-upload-keys] revoke failed:', 'timeout');
  });
});
