'use client';

import { useState } from 'react';

import { analyzeProposalAction, type ProposalDraftFinding } from '@/lib/proposal-action-identity';
import type { ProposalQueuedAction } from '@/lib/proposal-actions/types';
import { getProposalActionSummary } from '@/lib/proposal-call';
import { useDaoSessionStore } from '@/stores/dao-session-store';
import { normalizeWalletAddress, useProposalComposerStore } from '@/stores/proposal-composer-store';

export type AdminProposalRequest = {
  daoId: string;
  action: ProposalQueuedAction;
  metadata: { title: string; description: string; url: string };
  source: string;
  onAdded?: () => void;
};

export type PendingAdminProposal = AdminProposalRequest & {
  findings: ProposalDraftFinding[];
  summary: string;
};

export function useAdminProposalDraft() {
  const address = useDaoSessionStore((state) => state.address);
  const [pending, setPending] = useState<PendingAdminProposal | null>(null);

  function requestAdd(request: AdminProposalRequest) {
    if (!address) return;
    const walletKey = normalizeWalletAddress(address);
    const draft = useProposalComposerStore.getState().draftsByWallet[walletKey]?.[request.daoId];
    const findings = analyzeProposalAction(request.action, draft?.queuedActions ?? []);
    setPending({ ...request, findings, summary: getProposalActionSummary(request.action) });
  }

  function cancel() {
    setPending(null);
  }

  function resolve(resolution: 'add' | 'replace' | 'keep') {
    if (!pending || !address) return;
    const store = useProposalComposerStore.getState();
    const firstConflict = pending.findings.find((finding) => finding.existingActionIndexes.length > 0);

    if (resolution === 'replace' && firstConflict) {
      store.replaceAction(address, pending.daoId, firstConflict.existingActionIndexes[0], pending.action);
    } else {
      store.addAdminAction({
        address,
        daoId: pending.daoId,
        metadata: pending.metadata,
        action: pending.action,
        source: pending.source
      });
    }

    pending.onAdded?.();
    setPending(null);
  }

  return { pending, requestAdd, resolve, cancel };
}
