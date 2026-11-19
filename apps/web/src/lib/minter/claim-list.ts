import { getFetchableUrls } from '@/lib/ipfs-gateway';
import { cached } from '@/lib/server-cache';

import { type ClaimTreeFile, verifyClaimTree } from './tree';
import type { ClaimListState } from './types';

/** A published list is at most this large (the claim-list upload policy). */
const MAX_LIST_BYTES = 12 * 1024 * 1024;

/** Shown to members when no gateway returns the file (an HTTP status or a timeout means nothing to them). */
export const CLAIM_LIST_UNREACHABLE = "The published list couldn't be loaded from IPFS.";
const TOO_LARGE = 'The claim list is too large.';

/** The whole fetch, across every gateway: a member waits at most this long for a list's state. */
const FETCH_BUDGET_MS = 15_000;

async function fetchFrom(url: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(CLAIM_LIST_UNREACHABLE);
  const length = Number(response.headers.get('content-length') ?? '0');
  if (length > MAX_LIST_BYTES) throw new Error(TOO_LARGE);
  const text = await response.text();
  if (text.length > MAX_LIST_BYTES) throw new Error(TOO_LARGE);
  return JSON.parse(text);
}

/**
 * Ask every gateway at once and take the first JSON answer. Trying them one after another with a
 * timeout each kept a member on "Checking what you can claim…" for up to a minute and a half when
 * a list wasn't reachable (BUG-W06-2). A status code, a timeout or a body that isn't JSON from one
 * gateway is never the member's reason (BUG-W06-1).
 */
async function fetchJson(uri: string): Promise<unknown> {
  const urls = getFetchableUrls(uri);
  if (!urls?.length || !uri.startsWith('ipfs://')) throw new Error('The claim list address is not an ipfs:// link.');
  const done = new AbortController();
  const signal = AbortSignal.any([done.signal, AbortSignal.timeout(FETCH_BUDGET_MS)]);
  try {
    return await Promise.any(urls.map((url) => fetchFrom(url, signal)));
  } catch (error) {
    const reasons = error instanceof AggregateError ? error.errors : [];
    const tooLarge = reasons.some((reason) => reason instanceof Error && reason.message === TOO_LARGE);
    throw new Error(tooLarge ? TOO_LARGE : CLAIM_LIST_UNREACHABLE);
  } finally {
    done.abort();
  }
}

/** How long a failed fetch or verification is remembered before the file is tried again. */
const FAILURE_TTL_MS = 60_000;
const failures = new Map<string, { reason: string; until: number }>();

/**
 * The verified tree behind a root. IPFS content is immutable, so a verified
 * (uri, root) pair is cached for an hour. A failure (unreachable gateway, a
 * file that does not match the root) is remembered for a minute, so a broken
 * root cannot make every claims-page view re-download and re-hash the file.
 */
export async function loadClaimTree(uri: string, scope: { network: string; token: string; root: string }) {
  const key = `claim-tree:${uri}:${scope.root}`;
  const failed = failures.get(key);
  if (failed && failed.until > Date.now()) throw new Error(failed.reason);
  failures.delete(key);
  try {
    return await cached<ClaimTreeFile>(key, 60 * 60_000, async () => verifyClaimTree(await fetchJson(uri), scope));
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'The claim list could not be checked.';
    if (failures.size >= 500) failures.delete(failures.keys().next().value!);
    failures.set(key, { reason, until: Date.now() + FAILURE_TTL_MS });
    throw error;
  }
}

/** Test helper. */
export function clearClaimTreeFailures() {
  failures.clear();
}

/** The claim list as a member sees it, with their own allocation when they have one. */
export async function claimListState(
  merkle: { root: string | null; treeUri: string | null },
  scope: { network: string; token: string },
  address: string | null
): Promise<ClaimListState> {
  if (!merkle.root || !merkle.treeUri) return { status: 'none' };
  try {
    const tree = await loadClaimTree(merkle.treeUri, { ...scope, root: merkle.root });
    const entry = address ? (tree.claims[address] ?? null) : null;
    return {
      status: 'verified',
      recipients: Object.keys(tree.claims).length,
      tokenTotal: tree.tokenTotal,
      entry: entry ? { amount: entry.amount, proof: entry.proof } : null
    };
  } catch (error) {
    return {
      status: 'unavailable',
      reason: error instanceof Error ? error.message : 'The claim list could not be checked.'
    };
  }
}
