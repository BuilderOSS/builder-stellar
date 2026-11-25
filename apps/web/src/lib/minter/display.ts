import type { NetworkName } from '@/config/networks';
import { marketplaceAssetLabel, marketplaceDisplayAmount } from '@/lib/marketplace/asset-label';

import { MAX_CLAIM_PER_CALL } from './limits';
import type { ClaimListView } from './types';

/** The asset's code ("XLM"), or null for an asset this deployment does not list. */
export function claimAssetCode(network: NetworkName, asset: string) {
  const code = marketplaceAssetLabel(network, asset);
  return code === 'Unknown asset' ? null : code;
}

/** "12.5000000 XLM", or base units for an asset this deployment does not list. */
export function claimAmountLabel(network: NetworkName, asset: string, amount: string | bigint) {
  const code = claimAssetCode(network, asset);
  const value = marketplaceDisplayAmount(network, asset, amount);
  return code ? `${value} ${code}` : `${value} of an unlisted asset`;
}

export function claimPriceLabel(network: NetworkName, list: Pick<ClaimListView, 'asset' | 'price'>) {
  return BigInt(list.price) === 0n ? 'Free' : `${claimAmountLabel(network, list.asset, list.price)} per token`;
}

/** What the connected wallet can still claim on a verified list (0 when it has no entry). */
export function remainingAllocation(list: ClaimListView) {
  if (list.claimList.status !== 'verified' || !list.claimList.entry) return 0n;
  const left = BigInt(list.claimList.entry.amount) - BigInt(list.claimed ?? 0);
  return left > 0n ? left : 0n;
}

/** One claim mints at most MAX_CLAIM_PER_CALL tokens, and never more than the list has left. */
export function nextClaimCount(list: ClaimListView) {
  const left = remainingAllocation(list);
  const listLeft = BigInt(Math.max(0, list.total - list.minted));
  const cap = BigInt(MAX_CLAIM_PER_CALL);
  const next = [left, listLeft, cap].reduce((low, value) => (value < low ? value : low));
  return Number(next);
}

export type ListPhase = 'open' | 'expired' | 'failed' | 'full';

export function listPhase(list: ClaimListView, now = Math.floor(Date.now() / 1000)): ListPhase {
  if (list.assurance?.state === 'failed') return 'failed';
  if (now >= list.expiresAt) return 'expired';
  if (list.minted >= list.total) return 'full';
  return 'open';
}

/** The latest time a JavaScript Date can hold, in milliseconds (about the year 275760). */
const MAX_DATE_MS = 8.64e15;

/**
 * A list's expiry or a drive's deadline as a local date and time. Null for a time a Date cannot
 * hold: the ClaimMinter takes any future u64 (up to u64::MAX), and such a list has no end date in
 * practice, so each sentence says so in its own words instead of "Invalid Date".
 */
export function formatClaimDate(seconds: number): string | null {
  const ms = seconds * 1000;
  if (!Number.isFinite(ms) || Math.abs(ms) > MAX_DATE_MS) return null;
  return new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** The end of a list in a sentence: "closes 3 Dec 2026, 14:05", "closed …", or "no closing date". */
export function claimListEndText(expiresAt: number, now = Math.floor(Date.now() / 1000)) {
  const date = formatClaimDate(expiresAt);
  if (!date) return 'no closing date';
  return now >= expiresAt ? `closed ${date}` : `closes ${date}`;
}

const UNLIMITED_ALLOWANCE = 0xffffffff;
const tokens = (count: number) => `${count.toLocaleString()} ${count === 1 ? 'token' : 'tokens'}`;

/**
 * Founder supply in words: tokens left on the free claim lists opened in Setup. They are not in
 * the token's supply until claimed, and a list stays claimable after launch until it closes, up to
 * the claims module's mint allowance. Null when there are none.
 */
export function founderSupplyText({
  unclaimed,
  lists,
  allowance,
  live
}: {
  unclaimed: number;
  lists: number;
  /** The claims module's remaining mint allowance (4294967295 is unlimited); null for none. */
  allowance: number | null;
  live: boolean;
}): { title: string; description: string } | null {
  if (unclaimed <= 0) return null;
  const cap = allowance === null ? 0 : allowance >= UNLIMITED_ALLOWANCE ? unclaimed : Math.min(unclaimed, allowance);
  const where = `${lists === 1 ? 'a claim list' : `${lists.toLocaleString()} claim lists`} opened during setup`;
  const parts = [
    `${tokens(unclaimed)} on ${where} ${unclaimed === 1 ? 'is' : 'are'} not claimed yet, so ${unclaimed === 1 ? 'it is' : 'they are'} not in the token supply.`,
    `People on ${lists === 1 ? 'that list' : 'those lists'} can still claim them until ${lists === 1 ? 'it closes' : 'each list closes'}.`
  ];
  if (cap === 0)
    parts.push(
      `The claims module has no mint allowance left, so none can be minted until ${live ? 'a proposal' : 'the launch admin'} raises it.`
    );
  else if (cap < unclaimed)
    parts.push(`The claims module can mint ${tokens(cap)} of them, its remaining mint allowance.`);
  parts.push(
    live
      ? 'A proposal can close a list early to stop this.'
      : `They stay claimable after launch, until ${lists === 1 ? 'the list closes' : 'each list closes'}.`
  );
  return {
    title: cap === 0 ? 'Founder supply on setup lists' : `Founder supply: ${tokens(cap)} can still be minted`,
    description: parts.join(' ')
  };
}
