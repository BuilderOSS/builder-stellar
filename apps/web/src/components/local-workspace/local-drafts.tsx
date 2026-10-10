'use client';
import { useEffect, useState } from 'react';

import { ButtonLink } from '@/components/ui';
import { configuredCreationNetwork } from '@/lib/create-dao-schema';
import { getDeploymentConfig, isDeploymentConfigured } from '@/lib/deployment-config';
import { useAuthSessionStore } from '@/stores/auth-session-store';
import { useCreateDaoStore, visibleDraft } from '@/stores/create-dao-store';

import { useWorkspaceSync } from './workspace-sync';

/** Create-DAO drafts saved on this browser for the current wallet and network, newest first. */
export function useLocalDrafts() {
  useWorkspaceSync();
  const wallet = useAuthSessionStore((s) => s.address);
  const drafts = useCreateDaoStore((s) => s.drafts);
  const [hydrated, setHydrated] = useState(false);
  const scope = {
    wallet: wallet || null,
    network: configuredCreationNetwork(),
    deployment: isDeploymentConfigured() ? getDeploymentConfig().managerAddress : 'unconfigured'
  };
  useEffect(() => {
    void Promise.resolve(useCreateDaoStore.persist.rehydrate()).then(() => setHydrated(true));
  }, []);
  const visible = drafts
    .filter(
      (d) =>
        visibleDraft(d, scope) ||
        (d.scope.deployment === 'unassigned' &&
          d.scope.network === scope.network &&
          (!d.scope.wallet || d.scope.wallet === scope.wallet))
    )
    .sort((a, b) => b.updatedAt - a.updatedAt);
  return { drafts: visible, hydrated, scope };
}

/** Starts a fresh draft, then opens the create form on it. */
export function NewDraftButton({ hydrated, scope }: Pick<ReturnType<typeof useLocalDrafts>, 'hydrated' | 'scope'>) {
  return (
    <ButtonLink
      href="/create"
      variant="secondary"
      size="sm"
      onClick={() => {
        if (hydrated) useCreateDaoStore.getState().newDraft(scope);
      }}
    >
      Start another DAO
    </ButtonLink>
  );
}
