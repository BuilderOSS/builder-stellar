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

export function formatClaimDate(seconds: number) {
  return new Date(seconds * 1000).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
