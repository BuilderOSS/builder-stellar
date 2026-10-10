'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import styles from '@/components/create-dao/workspace.module.css';
import { Button, Callout } from '@/components/ui';
import { configuredCreationNetwork } from '@/lib/create-dao-schema';
import { getDeploymentConfig, isDeploymentConfigured } from '@/lib/deployment-config';
import { useAuthSessionStore } from '@/stores/auth-session-store';
import { creationStorageError, useCreateDaoStore, visibleDraft } from '@/stores/create-dao-store';

import { useWorkspaceSync } from './workspace-sync';

export function LocalDrafts() {
  useWorkspaceSync();
  const wallet = useAuthSessionStore((s) => s.address);
  const drafts = useCreateDaoStore((s) => s.drafts);
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
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
  return (
    <section aria-labelledby="local-drafts-heading" className={styles.stack}>
      <div className={styles.header} style={{ marginBottom: 0 }}>
        <div>
          <h2 id="local-drafts-heading">Local workspace</h2>
          <p className={styles.muted}>
            This browser only. Not shared or synced. Clearing browser data removes drafts and recovery records.
          </p>
        </div>
        <Link
          href="/create"
          onClick={() => {
            if (hydrated) useCreateDaoStore.getState().newDraft(scope);
          }}
        >
          New draft
        </Link>
      </div>
      {error || creationStorageError() ? (
        <Callout variant="error" title="Local workspace" description={error || creationStorageError()} />
      ) : null}
      {!hydrated ? (
        <p role="status">Loading drafts…</p>
      ) : !visible.length ? (
        <p className={styles.muted}>
          No drafts in this {scope.network} workspace. Start one without connecting a wallet.
        </p>
      ) : (
        <div className={styles.list}>
          {visible.map((d) => (
            <article key={d.id} className={styles.draft}>
              <div>
                <h3>{d.configuration.basicInfo.tokenName || 'Untitled DAO'}</h3>
                <p className={styles.muted}>
                  {d.deployment?.status === 'confirmed'
                    ? 'Created · Setup'
                    : d.deployment
                      ? 'Deployment recovery'
                      : 'Draft'}{' '}
                  · {d.scope.network} · {d.scope.wallet ? 'Wallet workspace' : 'Guest draft'}
                </p>
                <p className={styles.muted}>Saved {new Date(d.updatedAt).toLocaleString()}</p>
              </div>
              <div className={styles.links}>
                <Link href={`/create?draft=${encodeURIComponent(d.id)}`}>
                  {d.deployment ? 'Resume Setup' : 'Resume'}
                </Link>
                <Button
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={() => {
                    try {
                      useCreateDaoStore.getState().duplicateDraft(d.id);
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  Duplicate
                </Button>
                {!d.deployment || d.deployment.status === 'failed' ? (
                  <Button size="sm" type="button" variant="plain" onClick={() => setDeleteId(d.id)}>
                    Delete
                  </Button>
                ) : null}
              </div>
              {deleteId === d.id ? (
                <div role="group" aria-label="Confirm deletion" className={styles.links}>
                  <span>Delete this local draft? This cannot be undone.</span>
                  <Button
                    size="sm"
                    type="button"
                    onClick={() => {
                      try {
                        useCreateDaoStore.getState().deleteDraft(d.id);
                        setDeleteId(null);
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                  >
                    Delete draft
                  </Button>
                  <Button size="sm" type="button" variant="outline" onClick={() => setDeleteId(null)}>
                    Keep draft
                  </Button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
