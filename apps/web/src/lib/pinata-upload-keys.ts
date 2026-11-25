import { getPinataService, type PinataService } from './pinata-service';

/**
 * Keeps the operator's Pinata account from collecting live upload keys. `generate-jwt` creates
 * one single-use key per folder upload; `pin-cid` revokes it when it confirms the upload, and the
 * upload routes sweep the keys of uploads that never got that far once their deadline passes.
 */

/** One sweep per server instance per interval, so upload calls rarely wait on Pinata's key list. */
export const UPLOAD_KEY_SWEEP_INTERVAL_MS = 5 * 60 * 1000;
/** How long an upload call waits for a sweep it started; the sweep goes on after that. */
export const UPLOAD_KEY_SWEEP_WAIT_MS = 5_000;

let lastSweepAt = Number.NEGATIVE_INFINITY;
let running: Promise<void> | null = null;

const reason = (error: unknown) => (error instanceof Error ? error.message : String(error));

async function waitAtMost(work: Promise<void>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([work, new Promise<void>((resolve) => (timer = setTimeout(resolve, ms)))]);
  clearTimeout(timer);
}

/**
 * Revokes this app's expired upload keys, at most once per UPLOAD_KEY_SWEEP_INTERVAL_MS on this
 * instance. Never throws: a failed sweep is logged, and the next interval tries again.
 */
export async function sweepExpiredUploadKeys(
  service: PinataService = getPinataService(),
  now = Date.now()
): Promise<void> {
  if (running || now - lastSweepAt < UPLOAD_KEY_SWEEP_INTERVAL_MS) return;
  lastSweepAt = now;
  const sweep = service
    .revokeExpiredUploadKeys(now)
    .then((count) => {
      if (count) console.info(`[pinata-upload-keys] revoked ${count} expired upload key(s)`);
    })
    .catch((error) => console.error('[pinata-upload-keys] sweep failed:', reason(error)))
    .finally(() => {
      running = null;
    });
  running = sweep;
  await waitAtMost(sweep, UPLOAD_KEY_SWEEP_WAIT_MS);
}

/** Revokes one upload key whose upload is over. Never throws: a failure is logged, and the sweep retries it. */
export async function revokeUploadKeyQuietly(
  keyId: string,
  service: PinataService = getPinataService()
): Promise<boolean> {
  try {
    await service.revokeUploadKey(keyId);
    return true;
  } catch (error) {
    console.error('[pinata-upload-keys] revoke failed:', reason(error));
    return false;
  }
}

/** For tests: forget the last sweep. */
export function resetUploadKeySweep(): void {
  lastSweepAt = Number.NEGATIVE_INFINITY;
  running = null;
}
