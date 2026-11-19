import type { Route } from 'next';

import { daoRoute } from '@/lib/dao-routes';

import type { MarketplaceAction, MarketplaceListing } from './types';

/* ---------- Entry links ---------- */

/** The tribe's Market with the sell form open, and the token preselected when one is given. */
export function sellHref(routeId: string, tokenId?: string | number | null): Route {
  const sell = tokenId === undefined || tokenId === null || tokenId === '' ? '1' : String(tokenId);
  return `${daoRoute(routeId, 'marketplace')}?sell=${encodeURIComponent(sell)}` as Route;
}

/** `?sell=` as the form reads it: open or not, and the token to preselect (digits only). */
export function parseSellParam(value: string | null | undefined): { open: boolean; tokenId: string } {
  if (!value) return { open: false, tokenId: '' };
  // `?sell=1` means "open the form"; a token id is preselected only when the member holds it.
  return { open: true, tokenId: /^\d{1,10}$/.test(value) ? value : '' };
}

/* ---------- Listing end ---------- */

export type ListingEndPreset = '1d' | '7d' | '30d' | 'custom';
export const LISTING_END_PRESETS: Array<{ value: ListingEndPreset; label: string }> = [
  { value: '1d', label: '1 day' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: 'custom', label: 'Custom' }
];
export const DEFAULT_LISTING_END: ListingEndPreset = '7d';
const DAY_SECONDS = 86_400;
const PRESET_DAYS: Record<Exclude<ListingEndPreset, 'custom'>, number> = { '1d': 1, '7d': 7, '30d': 30 };

/**
 * The listing end in unix seconds: a preset from now, or the custom local date-time
 * (`datetime-local` value). Null when the custom value is empty, invalid or not in the future.
 */
export function listingEndSeconds(preset: ListingEndPreset, custom: string, nowMs = Date.now()): number | null {
  const now = Math.floor(nowMs / 1000);
  if (preset !== 'custom') return now + PRESET_DAYS[preset] * DAY_SECONDS;
  if (!custom) return null;
  const end = Math.floor(new Date(custom).getTime() / 1000);
  return Number.isSafeInteger(end) && end > now ? end : null;
}

/** A readable local date and time, for example "Wednesday 26 November 2026 at 14:05". */
export function formatListingEnd(seconds: number | string, locale?: string) {
  return new Date(Number(seconds) * 1000).toLocaleString(locale, { dateStyle: 'full', timeStyle: 'short' });
}

/* ---------- The guided signatures ---------- */

export type SellStepKind = 'cancel' | 'approve' | 'list';
export interface SellStep {
  kind: SellStepKind;
  action: MarketplaceAction;
  label: string;
  why: string;
}
export type ListTerms = Extract<MarketplaceAction, { action: 'list' }>;

export const SELL_STEP_COPY: Record<SellStepKind, { label: string; why: string }> = {
  cancel: {
    label: 'Cancel the current listing',
    why: 'Your token comes back to you first, because a token can only have one listing at a time.'
  },
  approve: {
    label: 'Allow the market to hold your token',
    why: 'The market can only take your token into its care with your permission. This permission covers only this token and lasts about 1 hour. Nothing is listed yet.'
  },
  list: {
    label: 'List for sale',
    why: 'This moves your token into the market and publishes your price. The market holds it until it sells, you cancel, or the listing ends.'
  }
};

function step(kind: SellStepKind, action: MarketplaceAction): SellStep {
  return { kind, action, ...SELL_STEP_COPY[kind] };
}

/**
 * The signatures for listing a token: Allow, then List. For a new price on a listed token,
 * Cancel comes first (moving the token clears any permission, so Allow is usually needed again).
 */
export function sellSequence(
  terms: ListTerms,
  cancel?: { action: 'cancel'; kind: 'secondary'; id: string; eventId: string }
): SellStep[] {
  return [
    ...(cancel ? [step('cancel', cancel)] : []),
    step('approve', { action: 'approve', tokenId: terms.tokenId }),
    step('list', terms)
  ];
}

/**
 * Where the sequence goes when it arrives at `index`, given the market's live permission:
 * an Allow step is skipped when a permission is already live, and a List step without one
 * goes back to Allow and says the permission expired.
 */
export function resolveSellStep(
  steps: SellStep[],
  index: number,
  approved: boolean
): { index: number; skipped: boolean; expired: boolean } {
  const current = steps[index];
  if (current?.kind === 'approve' && approved) return { index: index + 1, skipped: true, expired: false };
  if (current?.kind === 'list' && !approved) {
    const allow = steps.findIndex((item) => item.kind === 'approve');
    return { index: allow >= 0 ? allow : index, skipped: false, expired: true };
  }
  return { index, skipped: false, expired: false };
}

/** Whether a step needs the live permission read before it is prepared. */
export function needsApprovalRead(item: SellStep | undefined) {
  return item?.kind === 'approve' || item?.kind === 'list';
}

/* ---------- Showing confirmed changes before the indexer catches up ---------- */

export type PendingListingChange =
  | { type: 'listed'; listing: MarketplaceListing; at: number }
  | { type: 'cancelled'; tokenId: string; eventId: string; at: number };

/** A listing built from the confirmed List terms, shown as updating until the indexer returns it. */
export function pendingListing({
  terms,
  daoId,
  deploymentId,
  contractId,
  seller,
  hash,
  priceUnits,
  nowMs = Date.now()
}: {
  terms: ListTerms;
  daoId: string;
  deploymentId: string;
  contractId: string;
  seller: string;
  hash: string;
  priceUnits: string;
  nowMs?: number;
}): MarketplaceListing {
  return {
    deploymentId,
    daoId,
    contractId,
    eventId: `pending:${hash}`,
    kind: 'secondary',
    id: terms.tokenId,
    tokenId: terms.tokenId,
    price: priceUnits,
    paymentAsset: terms.paymentAsset,
    feeBps: terms.feeBps,
    seller,
    buyer: null,
    expiresAt: terms.expiresAt,
    status: 'open',
    createdAt: new Date(nowMs).toISOString(),
    closedAt: null,
    transactionHash: hash
  };
}

export function isPendingListing(listing: MarketplaceListing) {
  return listing.eventId.startsWith('pending:');
}

/** Give up on a change the indexer never reports, so nothing stays "updating" for ever. */
export const PENDING_TIMEOUT_MS = 5 * 60_000;

/**
 * The changes still waiting for the indexer: a listing until an open listing of that token with
 * the same transaction appears; a cancellation until that listing is no longer open.
 */
export function unsettledChanges(pending: PendingListingChange[], indexed: MarketplaceListing[], nowMs = Date.now()) {
  return pending.filter((change) => {
    if (nowMs - change.at > PENDING_TIMEOUT_MS) return false;
    if (change.type === 'listed')
      return !indexed.some(
        (row) =>
          row.kind === 'secondary' &&
          row.tokenId === change.listing.tokenId &&
          row.transactionHash === change.listing.transactionHash
      );
    return indexed.some((row) => row.eventId === change.eventId && row.status === 'open');
  });
}

/**
 * Indexed listings with confirmed changes applied: new listings first (marked by their
 * `pending:` event id), cancelled ones removed.
 */
export function withPendingChanges(indexed: MarketplaceListing[], pending: PendingListingChange[]) {
  const cancelled = new Set(pending.flatMap((change) => (change.type === 'cancelled' ? [change.eventId] : [])));
  const indexedHashes = new Set(indexed.map((row) => `${row.tokenId}:${row.transactionHash}`));
  const listed = pending.flatMap((change) =>
    change.type === 'listed' && !indexedHashes.has(`${change.listing.tokenId}:${change.listing.transactionHash}`)
      ? [change.listing]
      : []
  );
  return [...listed, ...indexed.filter((row) => !cancelled.has(row.eventId))];
}

/** Token ids the member just listed: hidden from the form's token choice until the indexer moves them. */
export function listedTokenIds(pending: PendingListingChange[]) {
  return new Set(pending.flatMap((change) => (change.type === 'listed' ? [change.listing.tokenId ?? ''] : [])));
}

/* ---------- The vote warning ---------- */

/**
 * What listing does to the member's vote: null when votes don't come from the token. A listed
 * token sits with the market, so its vote pauses; the last token also ends membership for delegation.
 */
export function sellVoteWarning({
  customVoteSource,
  tokenCount,
  delegated,
  membersOnlyDelegation
}: {
  customVoteSource: boolean;
  tokenCount: bigint;
  delegated: boolean;
  membersOnlyDelegation: boolean;
}): { title: string; description: string } | null {
  if (customVoteSource) return null;
  const whose = delegated ? 'your delegate' : 'you';
  const pause = `While it's listed, the market holds this token, so its vote pauses. The vote comes back to ${whose} if you cancel or the listing ends, and goes to the buyer if it sells.`;
  if (tokenCount <= 1n)
    return {
      title: 'This is your last token in this tribe',
      description: `${pause} ${
        membersOnlyDelegation
          ? "Until it comes back, you won't count as a member for delegation, so others can't delegate to you."
          : "Until it comes back, you won't hold a vote here."
      }`
    };
  return { title: 'Its vote pauses while it is listed', description: pause };
}
