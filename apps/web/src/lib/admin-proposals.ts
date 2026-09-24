'use client';

import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';

import type { DaoNetworkConfig } from '@/lib/dao-config';
import { daoRoute } from '@/lib/dao-routes';
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
  router,
  daoId,
  metadata,
  action,
  source
}: {
  router: AppRouterInstance;
  daoId: string;
  metadata: { title: string; description: string; url: string };
  action: ProposalQueuedAction;
  source: string;
}) {
  useProposalComposerStore.getState().startFromAdminAction({ metadata, action, source });
  router.push(daoRoute(daoId, 'proposals/create'));
}
