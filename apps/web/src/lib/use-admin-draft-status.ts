import { getProposalActionResourceKey } from '@/lib/proposal-action-identity';
import type { ProposalActionType, ProposalQueuedAction } from '@/lib/proposal-actions/types';
import { useDaoSessionStore } from '@/stores/dao-session-store';
import { normalizeWalletAddress, useProposalComposerStore } from '@/stores/proposal-composer-store';

/**
 * Hook to check if specific action types exist in the proposal draft
 * Useful for forms to show draft previews and detect conflicts
 */
export function useAdminDraftStatus(daoId: string, actionTypes: ProposalActionType | ProposalActionType[]) {
  const address = useDaoSessionStore((state) => state.address);
  const draft = useProposalComposerStore((state) => {
    if (!address) return null;
    const walletKey = normalizeWalletAddress(address);
    return state.draftsByWallet[walletKey]?.[daoId] ?? null;
  });

  const typesToCheck = Array.isArray(actionTypes) ? actionTypes : [actionTypes];
  const actionsInDraft = draft?.queuedActions.filter((action) => typesToCheck.includes(action.type)) ?? [];
  const resourceKeys = actionsInDraft.map((action) => getProposalActionResourceKey(action));

  function checkConflict(testAction: ProposalQueuedAction): {
    hasConflict: boolean;
    existingAction?: ProposalQueuedAction;
  } {
    const testResourceKey = getProposalActionResourceKey(testAction);
    const existing = actionsInDraft.find((action) => getProposalActionResourceKey(action) === testResourceKey);

    if (!existing) {
      return { hasConflict: false };
    }

    const isDuplicate = JSON.stringify(existing) === JSON.stringify(testAction);
    return { hasConflict: !isDuplicate, existingAction: existing };
  }

  return {
    actionsInDraft,
    hasActions: actionsInDraft.length > 0,
    resourceKeys,
    checkConflict
  };
}
