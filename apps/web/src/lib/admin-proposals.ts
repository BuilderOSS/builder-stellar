'use client';

import type { DaoNetworkConfig } from '@/lib/dao-config';
import type { ProposalQueuedAction } from '@/lib/proposal-actions/types';
import { useProposalComposerStore } from '@/stores/proposal-composer-store';

export function treasuryIsOwner(config: DaoNetworkConfig, owner: string | null | undefined) {
  return Boolean(config.treasuryContractId && owner === config.treasuryContractId);
}

export function treasuryHasAuthority(
  treasuryContractId: string,
  authorities: Array<{ authority: string; enabled?: boolean }> | undefined
) {
  return Boolean(
    treasuryContractId && authorities?.some((item) => item.authority === treasuryContractId && item.enabled !== false)
  );
}

export function startAdminProposal({
  daoId,
  metadata,
  action,
  source
}: {
  daoId: string;
  metadata: { title: string; description: string; url: string };
  action: ProposalQueuedAction;
  source: string;
}) {
  useProposalComposerStore.getState().addAdminAction({ daoId, metadata, action, source });
}
