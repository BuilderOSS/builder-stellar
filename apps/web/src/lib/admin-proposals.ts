'use client';

import type { DaoNetworkConfig } from '@/lib/dao-config';
import type { ProposalQueuedAction } from '@/lib/proposal-actions/types';
import { useProposalComposerStore } from '@/stores/proposal-composer-store';

export function treasuryIsAdmin(config: DaoNetworkConfig, admin: string | null | undefined) {
  return Boolean(config.treasuryContractId && admin === config.treasuryContractId);
}

export function startAdminProposal({
  address,
  daoId,
  metadata,
  action,
  source
}: {
  address: string;
  daoId: string;
  metadata: { title: string; description: string; url: string };
  action: ProposalQueuedAction;
  source: string;
}) {
  useProposalComposerStore.getState().addAdminAction({ address, daoId, metadata, action, source });
}
