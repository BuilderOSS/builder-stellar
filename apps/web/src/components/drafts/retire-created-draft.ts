import { getDeploymentConfig } from '@/lib/deployment-config';
import { type LocalDaoDraft, useCreateDaoStore } from '@/stores/create-dao-store';
import { preferenceScopeKey, useLocalPreferencesStore } from '@/stores/local-preferences-store';

/**
 * A created community no longer needs its creation draft: it exists on the network and lives on
 * its own Setup page. Before the draft goes, carry over what launch reads from it (whether auctions
 * and the market start at launch), so removing it never changes the launch defaults.
 */
export function retireCreatedDraft(draft: LocalDaoDraft) {
  const token = draft.deployment?.addresses?.token;
  if (draft.deployment?.status !== 'confirmed' || !token) return;
  const deployment =
    draft.scope.deployment === 'unassigned' ? getDeploymentConfig().managerAddress : draft.scope.deployment;
  const wallet = draft.scope.wallet ?? draft.deployment.deployer ?? null;
  const key = `${preferenceScopeKey({ network: draft.scope.network, deployment, wallet })}:${token}`;
  const prefs = useLocalPreferencesStore.getState();
  if (!prefs.launches[key])
    prefs.setLaunch(key, {
      auction: draft.configuration.auction.enabled,
      marketplace: draft.configuration.marketplace.enabled,
      minter: false
    });
  useCreateDaoStore.getState().deleteDraft(draft.id);
}
