import { Horizon, NotFoundError } from '@stellar/stellar-sdk';
import { NextResponse } from 'next/server';

import { getNetworkConfig, type NetworkName } from '@/config/networks';
import { sep10HorizonUrl } from '@/lib/auth/sep10-account';
import { requireAuthenticatedSession } from '@/lib/auth/server';

/**
 * Who may upload to IPFS through the operator's Pinata account.
 *
 * A session proves only that the caller holds a key, and keys cost nothing to make. Uploads and
 * pins cost the operator money, so each upload route also requires that the signed-in account
 * exists on the network (it was funded with at least the base reserve) and limits how often one
 * account may upload. Both checks are per server instance: a warm instance remembers a funded
 * account for FUNDED_TTL_MS and counts uploads in memory.
 */

export const FUNDED_TTL_MS = 10 * 60 * 1000;
export const UPLOAD_WINDOW_MS = 10 * 60 * 1000;

/** Uploads one account may make per route in UPLOAD_WINDOW_MS. */
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
    public readonly code: 'UPLOAD_ACCOUNT_UNFUNDED' | 'UPLOAD_ACCOUNT_LOOKUP_FAILED',
    message: string
  ) {
    super(message);
    this.name = 'UploadAccessError';
  }
}

const fundedUntil = new Map<string, number>();
const uploadWindows = new Map<string, { count: number; resetAt: number }>();

function prune<T>(map: Map<string, T>, expired: (value: T) => boolean) {
  for (const [key, value] of map) if (expired(value)) map.delete(key);
  if (map.size > 10_000) map.delete(map.keys().next().value as string);
}

/** Loads the account from the network's canonical Horizon; a test can swap the lookup. */
export type AccountLookup = (horizonUrl: string, address: string) => Promise<unknown>;

const horizonLookup: AccountLookup = (horizonUrl, address) =>
  new Horizon.Server(horizonUrl, { allowHttp: horizonUrl.startsWith('http://') }).loadAccount(address);

/**
 * The signed-in account, if it may upload: it must exist on the session's network. Throws an
 * AuthError without a session and an UploadAccessError when the account is unfunded or the
 * lookup fails (never treating a failed lookup as funded).
 */
export async function requireUploadAccount(lookup: AccountLookup = horizonLookup) {
  const session = await requireAuthenticatedSession();
  const key = `${session.network}:${session.address}`;
  const now = Date.now();
  prune(fundedUntil, (until) => until <= now);
  if ((fundedUntil.get(key) ?? 0) > now) return session;

  let horizonUrl: string;
  try {
    horizonUrl = sep10HorizonUrl(getNetworkConfig(session.network as NetworkName));
  } catch {
    throw new UploadAccessError(
      503,
      'UPLOAD_ACCOUNT_LOOKUP_FAILED',
      'The account could not be checked. Try again later.'
    );
  }

  try {
    await lookup(horizonUrl, session.address);
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw new UploadAccessError(
        403,
        'UPLOAD_ACCOUNT_UNFUNDED',
        'Uploads need a funded Stellar account. Add funds to this account, then try again.'
      );
    }
    throw new UploadAccessError(
      503,
      'UPLOAD_ACCOUNT_LOOKUP_FAILED',
      'The account could not be checked. Try again later.'
    );
  }

  fundedUntil.set(key, now + FUNDED_TTL_MS);
  return session;
}

/** A 429 response when `address` has used up `route`'s uploads for this window, else null. */
export function limitUploads(route: UploadRoute, address: string, now = Date.now()): NextResponse | null {
  prune(uploadWindows, (entry) => entry.resetAt <= now);
  const key = `${route}:${address}`;
  const current = uploadWindows.get(key);
  if (!current || current.resetAt <= now) {
    uploadWindows.set(key, { count: 1, resetAt: now + UPLOAD_WINDOW_MS });
    return null;
  }
  if (current.count >= UPLOAD_LIMITS[route]) {
    const retryAfter = Math.ceil((current.resetAt - now) / 1000);
    return NextResponse.json(
      {
        error: 'Too many uploads from this account. Try again in a few minutes.',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter
      },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    );
  }
  current.count += 1;
  return null;
}

export function uploadAccessErrorResponse(error: UploadAccessError): NextResponse {
  return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
}

/** Test hook: forget remembered accounts and upload counts. */
export function resetUploadAccessForTests() {
  fundedUntil.clear();
  uploadWindows.clear();
}
