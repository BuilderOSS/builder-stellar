import { useCallback, useMemo } from 'react';

import { getProposalActionResourceKey } from '@/lib/proposal-call';
import { useProposalComposerStore } from '@/stores/proposal-composer-store';
import { normalizeWalletAddress } from '@/stores/proposal-composer-store';
import type { ProposalActionType, ProposalQueuedAction } from '@/stores/proposal-composer-store';
import { useDaoSessionStore } from '@/stores/dao-session-store';

/**
 * Hook to check if specific action types exist in the proposal draft
 * Useful for forms to show draft previews and detect conflicts
 */
export function useAdminDraftStatus(
  daoId: string,
  actionTypes: ProposalActionType | ProposalActionType[]
) {
  const address = useDaoSessionStore((state) => state.address);
  const draft = useProposalComposerStore((state) => {
    if (!address) return null;
    const walletKey = normalizeWalletAddress(address);
    return state.draftsByWallet[walletKey]?.[daoId] ?? null;
  });

  const typesToCheck = useMemo(
    () => (Array.isArray(actionTypes) ? actionTypes : [actionTypes]),
    [actionTypes]
  );

  const actionsInDraft = useMemo(() => {
    if (!draft?.queuedActions) return [];
    return draft.queuedActions.filter((action) => typesToCheck.includes(action.type));
  }, [draft?.queuedActions, typesToCheck]);

  const resourceKeys = useMemo(() => {
    return actionsInDraft.map((action) => getProposalActionResourceKey(action));
  }, [actionsInDraft]);

  const checkConflict = useCallback(
    (testAction: ProposalQueuedAction): { hasConflict: boolean; existingAction?: ProposalQueuedAction } => {
      const testResourceKey = getProposalActionResourceKey(testAction);
      const existing = actionsInDraft.find((action) => {
        const existingKey = getProposalActionResourceKey(action);
        return existingKey === testResourceKey;
      });

      if (!existing) {
        return { hasConflict: false };
      }

      // Check if it's a duplicate or just a conflict
      const isDuplicate = JSON.stringify(existing) === JSON.stringify(testAction);
      return { hasConflict: !isDuplicate, existingAction: existing };
    },
    [actionsInDraft]
  );

  return {
    actionsInDraft,
    hasActions: actionsInDraft.length > 0,
    resourceKeys,
    checkConflict
  };
}
