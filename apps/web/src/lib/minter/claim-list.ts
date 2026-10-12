import { getFetchableUrls } from '@/lib/ipfs-gateway';
import { cached } from '@/lib/server-cache';

import { type ClaimTreeFile, verifyClaimTree } from './tree';
import type { ClaimListState } from './types';

/** A published list is at most this large (the claim-list upload policy). */
const MAX_LIST_BYTES = 12 * 1024 * 1024;

async function fetchJson(uri: string): Promise<unknown> {
  const urls = getFetchableUrls(uri);
  if (!urls?.length || !uri.startsWith('ipfs://')) throw new Error('The claim list address is not an ipfs:// link.');
  let last: unknown;
  for (const url of urls) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error(`${response.status}`);
      const length = Number(response.headers.get('content-length') ?? '0');
      if (length > MAX_LIST_BYTES) throw new Error('The claim list is too large.');
      const text = await response.text();
      if (text.length > MAX_LIST_BYTES) throw new Error('The claim list is too large.');
      return JSON.parse(text);
    } catch (error) {
      last = error;
    }
  }
  throw last instanceof Error ? last : new Error('The claim list could not be fetched.');
}

/**
 * The verified tree behind a root. IPFS content is immutable, so a verified
 * (uri, root) pair is cached for an hour; failures are not cached.
 */
export function loadClaimTree(uri: string, scope: { network: string; token: string; root: string }) {
  return cached<ClaimTreeFile>(`claim-tree:${uri}:${scope.root}`, 60 * 60_000, async () =>
    verifyClaimTree(await fetchJson(uri), scope)
  );
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
