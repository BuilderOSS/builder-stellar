'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { configuredCreationNetwork } from '@/lib/create-dao-schema';
import { getDeploymentConfig, isDeploymentConfigured } from '@/lib/deployment-config';
import { useAuthSessionStore } from '@/stores/auth-session-store';
import {
  assertPreferencesSaved,
  type HomeDao,
  preferenceScopeKey,
  useLocalPreferencesStore
} from '@/stores/local-preferences-store';

/**
 * The browser-local Home community for this network, deployment and wallet.
 * It is a preference, not an on-chain role.
 */
export function useHomeDao() {
  const wallet = useAuthSessionStore((state) => state.address);
  const homes = useLocalPreferencesStore((state) => state.homes);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void Promise.resolve(useLocalPreferencesStore.persist.rehydrate()).then(() => setReady(true));
  }, []);

  const scope = useMemo(
    () => ({
      network: configuredCreationNetwork(),
      deployment: isDeploymentConfigured() ? getDeploymentConfig().managerAddress : 'unconfigured',
      wallet: wallet || null
    }),
    [wallet]
  );

  const home: HomeDao | null = ready ? (homes[preferenceScopeKey(scope)] ?? null) : null;

  const setHome = useCallback(
    (dao: HomeDao | null) => {
      useLocalPreferencesStore.getState().setHome(scope, dao);
      assertPreferencesSaved();
    },
    [scope]
  );

  return { ready, home, setHome, network: scope.network };
}
