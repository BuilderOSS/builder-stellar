'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import styles from '@/components/create-dao/workspace.module.css';
import { Button } from '@/components/ui';
import { configuredCreationNetwork } from '@/lib/create-dao-schema';
import { getDeploymentConfig, isDeploymentConfigured } from '@/lib/deployment-config';
import { useAuthSessionStore } from '@/stores/auth-session-store';
import { assertPreferencesSaved, preferenceScopeKey, useLocalPreferencesStore } from '@/stores/local-preferences-store';

import { useWorkspaceSync } from './workspace-sync';

export function LocalHomeDao({ dao }: { dao?: { id: string; name: string; network: string } }) {
  useWorkspaceSync();
  const wallet = useAuthSessionStore((s) => s.address);
  const homes = useLocalPreferencesStore((s) => s.homes);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    void Promise.resolve(useLocalPreferencesStore.persist.rehydrate()).then(() => setReady(true));
  }, []);
  const scope = {
    network: configuredCreationNetwork(),
    deployment: isDeploymentConfigured() ? getDeploymentConfig().managerAddress : 'unconfigured',
    wallet: wallet || null
  };
  const home = homes[preferenceScopeKey(scope)];
  if (!ready || (dao && dao.network !== scope.network)) return null;
  if (!dao)
    return home ? (
      <div className={styles.draft}>
        <div>
          <strong>Home DAO</strong>
          <p className={styles.muted}>Local to this browser and wallet workspace</p>
        </div>
        <Link href={`/dao/${home.id}`}>{home.name || 'Open home DAO'}</Link>
      </div>
    ) : null;
  const selected = home?.id === dao.id;
  return (
    <div className={styles.links}>
      <Button
        type="button"
        size="sm"
        variant="outline"
        aria-pressed={selected}
        onClick={() => {
          try {
            useLocalPreferencesStore.getState().setHome(scope, selected ? null : { id: dao.id, name: dao.name });
            assertPreferencesSaved();
            setError('');
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        {selected ? 'Home DAO · Remove' : 'Set as home DAO'}
      </Button>
      <span className={styles.muted}>{error || 'This browser only'}</span>
    </div>
  );
}
