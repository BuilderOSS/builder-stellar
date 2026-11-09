'use client';

import { useMemo } from 'react';
import { css } from 'styled-system/css';
import useSWR from 'swr';

import { PageSection } from '@/components/page-section';
import { Callout, Chip, Disclosure, ListRow, Section, Skeleton } from '@/components/ui';
import { attentionItems } from '@/lib/platform/attention';
import { getPlatformConfig } from '@/lib/platform/config';
import { isPlatformAdmin, usePlatformState } from '@/lib/platform/registry';
import { summarizePlatform, usePlatformStorage } from '@/lib/platform/storage';
import { usePlatformTribes } from '@/lib/platform/tribes';
import { loadPlatformUpgrades } from '@/lib/platform-upgrades';
import { useAuthSessionStore } from '@/stores/auth-session-store';

import { whenLedger } from './format';
import { PlatformFactory } from './platform-factory';
import { PlatformRegistry } from './platform-registry';
import { PlatformRegistryAdmin } from './platform-registry-admin';
import { PlatformStorage } from './platform-storage';
import { PlatformTribes } from './platform-tribes';

const rows = css({ display: 'grid' });
const errorList = css({ m: '0', pl: '5', display: 'grid', gap: '1', textStyle: 'mono', fontSize: '0.8125rem' });

/**
 * The operator's page: shared storage, every tribe's storage, the registry and the factory.
 * Anyone can read it; actions show only for the live Manager admin signed in on the right network.
 */
export function PlatformOverview() {
  const config = useMemo(() => getPlatformConfig(), []);
  const session = useAuthSessionStore();
  const state = usePlatformState(config);
  const storage = usePlatformStorage(config, state.data);
  const tribes = usePlatformTribes(config);
  const upgrades = useSWR(['platform-page-upgrades', config.managerAddress], () => loadPlatformUpgrades(config), {
    revalidateOnFocus: false
  });

  const admin = state.data && isPlatformAdmin(session, state.data.admin) ? state.data.admin : null;
  const networkReady =
    !session.walletNetworkIssue &&
    (!session.walletNetworkPassphrase || session.walletNetworkPassphrase === config.passphrase);

  const pending = upgrades.data?.manager?.pending;
  const pendingText =
    pending && !pending.revoked && upgrades.data
      ? `${pending.version ?? `${pending.toHash.slice(0, 8)}…`} can apply from about ${whenLedger(pending.earliestLedger, upgrades.data.latestLedger)}.`
      : null;
  const attention = attentionItems({
    state: state.data,
    storage: storage.data ? summarizePlatform(storage.data.inventory) : undefined,
    tribes: tribes.rows,
    pendingManagerUpgrade: pendingText
  });
  const allLoaded = Boolean(state.data && storage.data && tribes.rows && tribes.checked === tribes.total);

  const refreshState = async () => {
    await Promise.all([state.mutate(), storage.mutate(), upgrades.mutate()]);
  };

  return (
    <PageSection
      title="Platform"
      description={
        admin
          ? 'Tribe Builder’s shared contracts, registry and storage.'
          : 'Tribe Builder’s shared contracts, registry and storage. Read only: changes need the platform admin wallet.'
      }
      actions={allLoaded && attention.length === 0 ? <Chip tone="success">Nothing needs attention</Chip> : null}
    >
      {admin && !networkReady ? (
        <Callout
          variant="warning"
          title="Switch your wallet's network"
          description="Reading works, but changes are blocked until your wallet is on the same network as Tribe Builder."
        />
      ) : null}

      {attention.length ? (
        <Section id="attention" title="Needs attention">
          <div className={rows}>
            {attention.map((item) => (
              <ListRow
                key={item.id}
                title={item.title}
                meta={item.detail}
                href={`#${item.section}`}
                trailing={<Chip tone={item.tone}>{item.tone === 'danger' ? 'Now' : 'Soon'}</Chip>}
              />
            ))}
          </div>
        </Section>
      ) : null}

      {state.error && !state.data ? (
        <Callout
          variant="error"
          title="The registry didn't load"
          description={state.error instanceof Error ? state.error.message : 'Try again in a moment.'}
        />
      ) : null}

      {state.data ? (
        <PlatformStorage config={config} storage={storage} admin={admin} networkReady={networkReady} />
      ) : (
        <Skeleton className={css({ height: '48', borderRadius: 'card' })} />
      )}

      <PlatformTribes tribes={tribes} />

      {state.data ? (
        admin ? (
          <PlatformRegistryAdmin
            config={config}
            state={state.data}
            admin={admin}
            networkReady={networkReady}
            onChanged={refreshState}
          />
        ) : (
          <PlatformRegistry state={state.data} />
        )
      ) : (
        <Skeleton className={css({ height: '64', borderRadius: 'card' })} />
      )}

      {state.data ? (
        <PlatformFactory
          config={config}
          state={state.data}
          admin={admin}
          networkReady={networkReady}
          onChanged={refreshState}
        />
      ) : null}

      {state.data?.errors.length ? (
        <Disclosure title={`Reads that failed (${state.data.errors.length})`}>
          <ul className={errorList}>
            {state.data.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </Disclosure>
      ) : null}
    </PageSection>
  );
}
