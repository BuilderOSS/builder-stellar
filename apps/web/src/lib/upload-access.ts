import { Horizon } from '@stellar/stellar-sdk';
import { NextResponse } from 'next/server';

import { accountNotFound, sep10HorizonUrl } from '@/lib/auth/sep10-account';
import { AuthError, getConfiguredNetwork, requireAuthenticatedSession } from '@/lib/auth/server';

/**
 * Who may upload to IPFS through the operator's Pinata account.
 *
 * A session proves only that the caller holds a key, and keys cost nothing to make. Uploads cost
 * the operator money, so each upload route limits how often one account may call it, then
 * requires that the account exists on the deployment's network (it was funded with at least the
 * base reserve). On testnet Friendbot funds accounts for free, so there the funded check costs an
 * abuser only a Friendbot call per key. Both checks are per server instance: a warm instance
 * remembers an account's result and counts calls in memory.
 */

export const FUNDED_TTL_MS = 10 * 60 * 1000;
export const UNFUNDED_TTL_MS = 60 * 1000;
export const UPLOAD_WINDOW_MS = 10 * 60 * 1000;
export const HORIZON_LOOKUP_TIMEOUT_MS = 8_000;

/** Calls one account may make to each upload route in UPLOAD_WINDOW_MS. */
export const UPLOAD_LIMITS = {
  'generate-jwt': 10,
  'pin-cid': 10,
  'pinata-url': 30,
  complete: 30
} as const;

export type UploadRoute = keyof typeof UPLOAD_LIMITS;

export class UploadAccessError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: 'UPLOAD_ACCOUNT_UNFUNDED' | 'UPLOAD_ACCOUNT_LOOKUP_FAILED' | 'RATE_LIMIT_EXCEEDED',
    message: string,
    public readonly retryAfter?: number
  ) {
    super(message);
    this.name = 'UploadAccessError';
  }
}

const UNFUNDED_MESSAGE = 'Uploads need a funded Stellar account. Add funds to this account, then try again.';
const LOOKUP_FAILED_MESSAGE = 'The account could not be checked. Try again later.';

/** Remembered lookups: until when an account counts as funded (true) or unfunded (false). */
const accountStatus = new Map<string, { funded: boolean; until: number }>();
const uploadWindows = new Map<string, { count: number; resetAt: number }>();

function prune<T>(map: Map<string, T>, expired: (value: T) => boolean) {
  for (const [key, value] of map) if (expired(value)) map.delete(key);
  if (map.size > 10_000) map.delete(map.keys().next().value as string);
}

/** Loads the account from the network's canonical Horizon; a test can swap the lookup. */
export type AccountLookup = (horizonUrl: string, address: string) => Promise<unknown>;

const horizonLookup: AccountLookup = (horizonUrl, address) =>
  new Horizon.Server(horizonUrl, { allowHttp: horizonUrl.startsWith('http://') }).loadAccount(address);

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Horizon lookup timed out')), ms);
    })
  ]).finally(() => clearTimeout(timer));
}

/** Count one call by `address` to `route`; throws a 429 UploadAccessError past the limit. */
export function countUpload(route: UploadRoute, address: string, now = Date.now()) {
  prune(uploadWindows, (entry) => entry.resetAt <= now);
  const key = `${route}:${address}`;
  const current = uploadWindows.get(key);
  if (!current || current.resetAt <= now) {
    uploadWindows.set(key, { count: 1, resetAt: now + UPLOAD_WINDOW_MS });
    return;
  }
  if (current.count >= UPLOAD_LIMITS[route]) {
    throw new UploadAccessError(
      429,
      'RATE_LIMIT_EXCEEDED',
      'Too many uploads from this account. Try again in a few minutes.',
      Math.ceil((current.resetAt - now) / 1000)
    );
  }
  current.count += 1;
}

/**
 * The signed-in account, if it may call this upload route now. In order: a session on this
 * deployment's network (AuthError otherwise), within the route's limit for the account (429), and
 * an account that exists on that network (403 when Horizon says it doesn't, 503 when the lookup
 * fails: a failed lookup never counts as funded).
 */
export async function requireUploadAccount(route: UploadRoute, lookup: AccountLookup = horizonLookup) {
  const session = await requireAuthenticatedSession();
  const network = getConfiguredNetwork();
  if (session.network !== network.name) {
    throw new AuthError('NETWORK_MISMATCH', 'Sign in on this deployment’s network to upload.');
  }
  countUpload(route, session.address);

  const key = `${network.name}:${session.address}`;
  const now = Date.now();
  prune(accountStatus, (status) => status.until <= now);
  const known = accountStatus.get(key);
  if (known && known.until > now) {
    if (known.funded) return session;
    throw new UploadAccessError(403, 'UPLOAD_ACCOUNT_UNFUNDED', UNFUNDED_MESSAGE);
  }

  let horizonUrl: string;
  try {
    horizonUrl = sep10HorizonUrl(network);
  } catch {
    throw new UploadAccessError(503, 'UPLOAD_ACCOUNT_LOOKUP_FAILED', LOOKUP_FAILED_MESSAGE);
  }

  try {
    await withTimeout(lookup(horizonUrl, session.address), HORIZON_LOOKUP_TIMEOUT_MS);
  } catch (error) {
    if (accountNotFound(error)) {
      accountStatus.set(key, { funded: false, until: now + UNFUNDED_TTL_MS });
      throw new UploadAccessError(403, 'UPLOAD_ACCOUNT_UNFUNDED', UNFUNDED_MESSAGE);
    }
    throw new UploadAccessError(503, 'UPLOAD_ACCOUNT_LOOKUP_FAILED', LOOKUP_FAILED_MESSAGE);
  }

  accountStatus.set(key, { funded: true, until: now + FUNDED_TTL_MS });
  return session;
}

export function uploadAccessErrorResponse(error: UploadAccessError): NextResponse {
  return NextResponse.json(
    { error: error.message, code: error.code, ...(error.retryAfter ? { retryAfter: error.retryAfter } : {}) },
    {
      status: error.status,
      ...(error.retryAfter ? { headers: { 'Retry-After': String(error.retryAfter) } } : {})
    }
  );
}

/** Test hook: forget remembered accounts and upload counts. */
export function resetUploadAccessForTests() {
  accountStatus.clear();
  uploadWindows.clear();
}
