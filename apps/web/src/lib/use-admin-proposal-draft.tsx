'use client';

import { useState } from 'react';

import { analyzeProposalAction, type ProposalDraftFinding } from '@/lib/proposal-action-identity';
import type { ProposalQueuedAction } from '@/lib/proposal-actions/types';
import { getProposalActionSummary } from '@/lib/proposal-call';
import { useAuthSessionStore } from '@/stores/auth-session-store';
import { normalizeWalletAddress, useProposalComposerStore } from '@/stores/proposal-composer-store';

export type AdminProposalRequest = {
  daoId: string;
  action: ProposalQueuedAction;
  metadata: { title: string; description: string; url: string };
  source: string;
  onAdded?: () => void;
};

export type AdminProposalBatchRequest = {
  daoId: string;
  requests: AdminProposalRequest[];
  onAdded?: () => void;
};

type PendingAdminFinding = ProposalDraftFinding & { actionId: string };

export type PendingAdminProposal = AdminProposalRequest & {
  requests: AdminProposalRequest[];
  findings: PendingAdminFinding[];
  summaries: string[];
};

export function useAdminProposalDraft() {
  const address = useAuthSessionStore((state) => state.address);
  const [pending, setPending] = useState<PendingAdminProposal | null>(null);

  function requestAdd(request: AdminProposalRequest) {
    requestAddBatch({ daoId: request.daoId, requests: [request] });
  }

  function requestAddBatch({ daoId, requests, onAdded }: AdminProposalBatchRequest) {
    if (!address) return;
    const walletKey = normalizeWalletAddress(address);
    const draft = useProposalComposerStore.getState().draftsByWallet[walletKey]?.[daoId];
    const projectedActions = [...(draft?.queuedActions ?? [])];
    const findings: PendingAdminFinding[] = [];

    for (const request of requests) {
      findings.push(
        ...analyzeProposalAction(request.action, projectedActions).map((finding) => ({
          ...finding,
          actionId: request.action.id
        }))
      );
      projectedActions.push(request.action);
    }

    setPending({
      daoId,
      requests,
      action: requests[0].action,
      metadata: requests[0].metadata,
      source: requests[0].source,
      onAdded,
      findings,
      summaries: requests.map((request) => getProposalActionSummary(request.action))
    });
  }

  function cancel() {
    setPending(null);
  }

  function resolve(resolution: 'add' | 'replace' | 'keep') {
    if (!pending || !address) return;
    const store = useProposalComposerStore.getState();
    for (const request of pending.requests) {
      const actionFindings = pending.findings.filter((finding) => finding.actionId === request.action.id);
      const conflict = actionFindings.find((finding) => finding.kind === 'conflict');
      const duplicate = actionFindings.some((finding) => finding.kind === 'duplicate');

      if (resolution === 'replace' && conflict) {
        store.replaceAction(address, pending.daoId, conflict.existingActionIndexes[0], request.action);
      } else if (!duplicate && (!conflict || resolution === 'keep')) {
        store.addAdminAction({
          address,
          daoId: pending.daoId,
          metadata: request.metadata,
          action: request.action,
          source: request.source
        });
      }
    }

    setPending(null);
    pending.onAdded?.();
  }

  return { pending, requestAdd, requestAddBatch, resolve, cancel };
}
