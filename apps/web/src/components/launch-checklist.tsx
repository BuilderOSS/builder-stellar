'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';

import { ArtworkSetup } from '@/components/create-dao/ArtworkSetup';
import { launchReadinessIssues, readLaunchReadiness } from '@/components/create-dao/launch-readiness';
import styles from '@/components/create-dao/workspace.module.css';
import { Button, Callout } from '@/components/ui';
import type { DaoNetworkConfig } from '@/lib/dao-config';
import { getDeploymentConfig } from '@/lib/deployment-config';
import { useDaoDeployment } from '@/lib/use-dao-deployment';
import { useAuthSessionStore } from '@/stores/auth-session-store';
import { useCreateDaoStore } from '@/stores/create-dao-store';
import { assertPreferencesSaved, preferenceScopeKey, useLocalPreferencesStore } from '@/stores/local-preferences-store';

export function LaunchChecklist({ daoId, config }: { daoId: string; config: DaoNetworkConfig }) {
  const router = useRouter();
  const session = useAuthSessionStore();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [reviewSnapshot, setReviewSnapshot] = useState('');
  const [artworkOpen, setArtworkOpen] = useState(false);
  const operation = useRef(false);
  const launches = useLocalPreferencesStore((s) => s.launches);
  const { launchDao } = useDaoDeployment(session.address, config.name);
  const deployment = getDeploymentConfig();
  const key = `${preferenceScopeKey({ network: config.name, deployment: deployment.managerAddress, wallet: session.address || null })}:${daoId}`;
  const choice = launches[key] ?? { auction: false, marketplace: false, minter: false };
  const {
    data,
    error: readError,
    isLoading,
    isValidating,
    mutate
  } = useSWR(
    ['launch-readiness', config.name, deployment.managerAddress, daoId],
    () => readLaunchReadiness(daoId, config),
    { refreshInterval: 15000, revalidateOnFocus: true }
  );
  useEffect(() => {
    let canceled = false;
    void (async () => {
      await Promise.all([useCreateDaoStore.persist.rehydrate(), useLocalPreferencesStore.persist.rehydrate()]);
      if (canceled) return;
      const prefs = useLocalPreferencesStore.getState();
      const draft = useCreateDaoStore
        .getState()
        .drafts.find(
          (d) =>
            d.deployment?.addresses?.token === daoId &&
            d.scope.network === config.name &&
            d.scope.deployment === deployment.managerAddress &&
            d.scope.wallet === session.address
        );
      if (!prefs.launches[key] && draft)
        prefs.setLaunch(key, {
          auction: draft.configuration.auction.enabled,
          marketplace: draft.configuration.marketplace.enabled,
          minter: false
        });
      setReady(true);
    })();
    return () => {
      canceled = true;
    };
  }, [key, daoId, config.name, deployment.managerAddress, session.address]);
  const issues = data ? launchReadinessIssues(data, config.launchAdmin) : [];
  const currentReview = JSON.stringify([
    key,
    choice.auction,
    choice.marketplace,
    choice.minter,
    data?.platformMinter,
    data?.pending?.auction_payment_asset,
    data?.pending?.marketplace_payment_asset
  ]);
  const reviewed = reviewSnapshot === currentReview;
  const recover = Boolean(choice.hash && !['failed', 'rejected', 'expired'].includes(choice.status ?? ''));
  const confirmed = choice.status === 'confirmed';
  const admin = session.address === config.launchAdmin && session.authStatus === 'authenticated';
  const change = (patch: Partial<typeof choice>) => {
    setReviewSnapshot('');
    useLocalPreferencesStore.getState().setLaunch(key, { ...choice, ...patch });
    try {
      assertPreferencesSaved();
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const handleLaunch = async (rebroadcast = false) => {
    if (operation.current || !admin || !ready) return;
    operation.current = true;
    setBusy(true);
    setError('');
    try {
      if (!recover) {
        if (!reviewed) throw new Error('Review the launch choices first');
        const fresh = await readLaunchReadiness(daoId, config);
        const currentIssues = launchReadinessIssues(fresh, config.launchAdmin);
        if (currentIssues.length) {
          await mutate(fresh, false);
          throw new Error(currentIssues.join(' '));
        }
        if (choice.minter && fresh.platformMinter !== data?.platformMinter)
          throw new Error('The platform minter changed. Refresh and review it again.');
      }
      await launchDao(
        daoId,
        {
          launch_auction: choice.auction,
          launch_marketplace: choice.marketplace,
          enable_minter: choice.minter,
          expected_minter: choice.minter ? data?.platformMinter : null
        },
        { rebroadcast }
      );
      setError('');
      await mutate();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Launch needs attention');
    } finally {
      setBusy(false);
      operation.current = false;
    }
  };
  return (
    <section className={styles.panel} aria-labelledby="launch-title">
      <div className={styles.stack}>
        <div>
          <h2 id="launch-title">Setup → Launch</h2>
          <p className={styles.muted}>
            Launch hands control to the DAO treasury and starts only the modules selected below. Payment assets stay
            fixed.
          </p>
        </div>
        <div className={styles.links}>
          <Link href={`/dao/${daoId}/admin/founders`}>Mint founder tokens</Link>
          <Button
            type="button"
            variant="plain"
            aria-expanded={artworkOpen}
            aria-controls="artwork-setup-panel"
            onClick={() => setArtworkOpen((open) => !open)}
          >
            Set up artwork
          </Button>
          <Link href={`/dao/${daoId}/admin/auction`}>Review auction settings</Link>
          <Link href={`/dao/${daoId}/admin/marketplace`}>Review marketplace settings</Link>
        </div>
        {artworkOpen ? (
          <section id="artwork-setup-panel" aria-label="Artwork setup">
            <ArtworkSetup daoId={daoId} config={config} />
          </section>
        ) : null}
        {isLoading || !ready ? <p role="status">Checking live supply and ownership…</p> : null}
        {readError ? <Callout variant="error" title="Readiness unavailable" description={readError.message} /> : null}
        {data ? (
          <>
            <dl className={styles.summary}>
              <div>
                <dt>Live token supply</dt>
                <dd>
                  {data.supply.toString()} {data.supply > 0n ? '· Ready' : '· Founder mint required'}
                </dd>
              </div>
              <div>
                <dt>Payment assets</dt>
                <dd>
                  {data.paymentAssetsMatch
                    ? 'Match the assets pinned at creation'
                    : data.live
                      ? 'DAO is live'
                      : 'Do not match or could not be verified'}
                </dd>
              </div>
              {data.pending ? (
                <>
                  <div>
                    <dt>Auction asset</dt>
                    <dd className={styles.code}>{data.pending.auction_payment_asset}</dd>
                  </div>
                  <div>
                    <dt>Marketplace asset</dt>
                    <dd className={styles.code}>{data.pending.marketplace_payment_asset}</dd>
                  </div>
                </>
              ) : null}
            </dl>
            {issues.length && !confirmed ? (
              <ul>
                {issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            ) : null}
          </>
        ) : null}
        <fieldset disabled={!ready || busy || recover} style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className={styles.label}>Modules at launch</legend>
          <label className={styles.choice}>
            <input type="checkbox" checked={choice.auction} onChange={(e) => change({ auction: e.target.checked })} />
            Auctions
          </label>
          <label className={styles.choice}>
            <input
              type="checkbox"
              checked={choice.marketplace}
              onChange={(e) => change({ marketplace: e.target.checked })}
            />
            Marketplace
          </label>
          <label className={styles.choice}>
            <input
              type="checkbox"
              checked={choice.minter}
              disabled={!data?.platformMinter}
              onChange={(e) => change({ minter: e.target.checked })}
            />
            Platform minter (optional)
          </label>
          {data?.platformMinter ? (
            <p className={styles.code}>{data.platformMinter}</p>
          ) : (
            <p className={styles.muted}>No platform minter is registered.</p>
          )}
        </fieldset>
        {error ? <Callout variant="error" title="Launch needs attention" description={error} /> : null}
        {confirmed ? (
          <Callout
            variant="success"
            title="Launch confirmed"
            description="The launch transaction succeeded. Refresh the overview while the directory catches up."
          />
        ) : null}
        {!admin ? <p className={styles.muted}>Connect and sign in as the launch administrator to launch.</p> : null}
        {!recover ? (
          <label className={styles.choice}>
            <input
              type="checkbox"
              checked={reviewed}
              disabled={busy}
              onChange={(e) => setReviewSnapshot(e.target.checked ? currentReview : '')}
            />
            I reviewed these modules and the pinned payment assets.
          </label>
        ) : null}
        <div className={styles.links}>
          <Button
            variant="outline"
            type="button"
            disabled={busy || isValidating}
            onClick={() => {
              setReviewSnapshot('');
              void mutate();
              router.refresh();
            }}
          >
            Refresh readiness
          </Button>
          {!confirmed ? (
            <Button
              type="button"
              disabled={
                busy ||
                !admin ||
                !ready ||
                Boolean(session.walletNetworkIssue) ||
                (!recover &&
                  (!data ||
                    Boolean(readError) ||
                    Boolean(issues.length) ||
                    !reviewed ||
                    (choice.minter && !data.platformMinter)))
              }
              onClick={() => void handleLaunch()}
            >
              {busy ? 'Checking launch…' : recover ? 'Check saved launch transaction' : 'Sign and launch DAO'}
            </Button>
          ) : null}
          {recover && !confirmed && choice.signedTxXdr ? (
            <Button
              type="button"
              variant="outline"
              disabled={busy || !admin || !ready || Boolean(session.walletNetworkIssue)}
              onClick={() => void handleLaunch(true)}
            >
              Rebroadcast saved launch envelope
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
