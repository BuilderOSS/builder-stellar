import { assertAdminCallSupported } from '@/lib/admin-registered-call';
import type { DaoNetworkConfig } from '@/lib/dao-config';
import { getActionHandler, isRegisteredActionType } from '@/lib/proposal-actions/registry';
import type { FormContext, ProposalQueuedAction } from '@/lib/proposal-actions/types';
import { getProposalActionSummary } from '@/lib/proposal-call';
import { type PendingAction, usePendingActionStore } from '@/stores/pending-action-store';
import { normalizeWalletAddress, useProposalComposerStore } from '@/stores/proposal-composer-store';

import type { ActionRequest } from './action-request';
import { type ActionResolution, resolveAction, reviewAction } from './review';

export type ProposeResult =
  { outcome: 'added' } | { outcome: 'review' } | { outcome: 'invalid'; message: string } | { outcome: 'no-wallet' };

/** Told after an action lands, with the queue before it so the toast can undo it. */
export type AddedNotice = {
  address: string;
  daoId: string;
  previous: ProposalQueuedAction[];
  next: ProposalQueuedAction[];
};

/** Each action as its handler reads it back, checked by the handler and by the call encoder. */
export function validateAction(request: ActionRequest, config: DaoNetworkConfig, address: string | null) {
  if (!request.actions.length) return 'There is nothing to add.';
  const context: FormContext = { config, session: { address, kit: null } };
  for (const action of request.actions) {
    if (!isRegisteredActionType(action.type)) return 'This change is not supported.';
    const handler = getActionHandler(action.type);
    try {
      const data = handler.deserialize(action);
      const result = handler.validate(data, context);
      if (!result.valid) return result.message || 'Check the values.';
      assertAdminCallSupported(handler, data, context);
    } catch (error) {
      return error instanceof Error ? error.message : 'Check the values.';
    }
  }
  return null;
}

function queueOf(address: string, daoId: string) {
  return (
    useProposalComposerStore.getState().draftsByWallet[normalizeWalletAddress(address)]?.[daoId]?.queuedActions ?? []
  );
}

function apply(
  pending: Omit<PendingAction, 'summaries'>,
  resolution: ActionResolution,
  notify: (n: AddedNotice) => void
) {
  const previous = queueOf(pending.address, pending.daoId);
  const next = resolveAction(pending.request, previous, pending.findings, resolution);
  if (next.length === previous.length && next.every((action, index) => action === previous[index])) return false;
  useProposalComposerStore.getState().restore(pending.address, pending.daoId, next);
  notify({ address: pending.address, daoId: pending.daoId, previous, next });
  pending.onAdded?.();
  return true;
}

/**
 * The one way an action joins a proposal. It checks every action, then adds it at once (with an undo
 * notice) or, when it repeats, clashes or is high-risk, hands it to ProposeActionDialog. It never navigates.
 */
export function proposeAction({
  address,
  daoId,
  config,
  request,
  notify,
  onAdded
}: {
  address: string | null;
  daoId: string;
  config: DaoNetworkConfig;
  request: ActionRequest;
  notify: (notice: AddedNotice) => void;
  onAdded?: () => void;
}): ProposeResult {
  if (!address) return { outcome: 'no-wallet' };
  const problem = validateAction(request, config, address);
  if (problem) return { outcome: 'invalid', message: problem };

  const { findings, needsReview } = reviewAction(request, queueOf(address, daoId), config);
  if (needsReview) {
    usePendingActionStore.getState().open({
      address,
      daoId,
      request,
      findings,
      summaries: request.actions.map(getProposalActionSummary),
      onAdded
    });
    return { outcome: 'review' };
  }
  apply({ address, daoId, request, findings, onAdded }, 'add', notify);
  return { outcome: 'added' };
}

/** The member's answer in ProposeActionDialog. Returns whether anything was added. */
export function resolvePendingAction(resolution: ActionResolution | 'cancel', notify: (notice: AddedNotice) => void) {
  const store = usePendingActionStore.getState();
  const pending = store.pending;
  store.close();
  if (!pending || resolution === 'cancel') return false;
  return apply(pending, resolution, notify);
}
