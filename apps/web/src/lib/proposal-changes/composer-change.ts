import type { ProposalQueuedAction } from '@/lib/proposal-actions/types';
import { getProposalActionSummary } from '@/lib/proposal-call';

import { bundleLabel, CHANGE_SOURCES, type ChangeRequest } from './change-request';
import { queueItems } from './queue';

/** Auction calls the contract only accepts while auctions are paused. */
const NEEDS_PAUSED_AUCTION = new Set([
  'set-auction-reserve-price',
  'set-auction-payment-token',
  'set-auction-duration',
  'set-auction-time-buffer',
  'set-auction-min-bid-increment',
  'cancel-auction'
]);

const AUCTION_BUNDLE = 'Change the auction';

function newAction(type: 'pause-auction' | 'unpause-auction'): ProposalQueuedAction {
  return { id: crypto.randomUUID(), type, recipient: '', amount: '' };
}

/**
 * An action made in the composer, as a change. An auction setting picked on its own is wrapped in pause and
 * resume, the same way Manage → Auction plans it; with a "Change the auction" bundle already queued, it
 * joins that bundle before its resume step instead.
 */
export function composerChange(
  action: ProposalQueuedAction,
  queue: ProposalQueuedAction[],
  { editingId, auctionPaused }: { editingId?: string; auctionPaused?: boolean } = {}
): ChangeRequest {
  const note = `${getProposalActionSummary(action).replace(/\.$/, '')}.`;
  const base = { source: CHANGE_SOURCES.composer, note };
  const edited = editingId ? queue.find((candidate) => candidate.id === editingId) : undefined;

  // An edit keeps its place, and its bundle when it is one of a bundle's steps.
  if (edited) {
    const kept = edited.bundleId ? { bundleId: edited.bundleId, bundleLabel: edited.bundleLabel } : {};
    const bundle = edited.bundleId ? queue.filter((candidate) => candidate.bundleId === edited.bundleId) : [];
    if (bundle.length > 1) {
      const actions = bundle.map((candidate) => (candidate.id === edited.id ? { ...action, ...kept } : candidate));
      return {
        ...base,
        actions,
        bundle: { id: String(edited.bundleId), label: String(edited.bundleLabel ?? '') },
        source: (edited.source as ChangeRequest['source']) ?? base.source,
        note: String(edited.note ?? note),
        replaces: [edited.id]
      };
    }
    return { ...base, actions: [action], replaces: [edited.id] };
  }

  if (!NEEDS_PAUSED_AUCTION.has(action.type) || auctionPaused) return { ...base, actions: [action] };

  // Join an auction bundle that still ends by resuming: the setting goes in just before the resume.
  const open = queueItems(queue).find(
    (item) =>
      item.bundleId &&
      item.actions[0].type === 'pause-auction' &&
      item.actions.at(-1)?.type === 'unpause-auction' &&
      String(item.bundleLabel ?? '').startsWith(AUCTION_BUNDLE)
  );
  if (open) {
    const steps = [...open.actions.slice(0, -1), action, open.actions.at(-1)!];
    return {
      ...base,
      actions: steps,
      bundle: { id: open.bundleId!, label: bundleLabel(AUCTION_BUNDLE, steps.length) },
      source: (open.actions[0].source as ChangeRequest['source']) ?? base.source,
      note: `${String(open.actions[0].note ?? '').replace(/\.$/, '')}${open.actions[0].note ? '. ' : ''}${note}`,
      replaces: [open.actions[0].id]
    };
  }

  const steps = [newAction('pause-auction'), action, newAction('unpause-auction')];
  return {
    ...base,
    actions: steps,
    bundle: { id: crypto.randomUUID(), label: bundleLabel(AUCTION_BUNDLE, steps.length) },
    note: `Pause auctions, ${note.charAt(0).toLowerCase()}${note.slice(1, -1)}, then resume them.`
  };
}
