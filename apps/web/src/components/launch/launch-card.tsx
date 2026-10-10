'use client';

import { Rocket } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { css } from 'styled-system/css';

import {
  type LaunchReadiness,
  launchReadinessIssues,
  readLaunchReadiness
} from '@/components/create-dao/launch-readiness';
import { Address, Button, Callout, Dialog, Disclosure, Switch } from '@/components/ui';
import { card, muted, title } from '@/components/ui/panel-styles';
import { useDaoContext } from '@/contexts/dao-context';
import { parseContractErrorCode } from '@/lib/contract-errors';
import type { DaoNetworkConfig } from '@/lib/dao-config';
import { daoRoute } from '@/lib/dao-routes';
import { getDeploymentConfig } from '@/lib/deployment-config';
import type { LaunchPlan } from '@/lib/launch-steps';
import { useDaoDeployment } from '@/lib/use-dao-deployment';
import { useAuthSessionStore } from '@/stores/auth-session-store';
import { useCreateDaoStore } from '@/stores/create-dao-store';
import { assertPreferencesSaved, preferenceScopeKey, useLocalPreferencesStore } from '@/stores/local-preferences-store';

const group = css({ display: 'grid', gap: '3' });
const subTitle = css({ textStyle: 'label', color: 'ink', m: '0' });
const consequences = css({
  m: '0',
  pl: '5',
  display: 'grid',
  gap: '1.5',
  textStyle: 'body',
  color: 'ink',
  '& li::marker': { color: 'ink.muted' }
});
const footer = css({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '3',
  flexWrap: 'wrap'
});
const hint = css({ textStyle: 'caption', color: 'ink.muted', m: '0' });

/**
 * Choose what starts, see what launching does, and launch. Launch re-reads readiness right before
 * signing; a saved launch transaction switches the card to its recovery state.
 */
export function LaunchCard({
  daoId,
  config,
  readiness,
  plan,
  refresh
}: {
  daoId: string;
  config: DaoNetworkConfig;
  readiness: LaunchReadiness | undefined;
  plan: LaunchPlan;
  refresh: (fresh?: LaunchReadiness) => Promise<unknown>;
}) {
  const { routeId } = useDaoContext();
  const router = useRouter();
  const session = useAuthSessionStore();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const operation = useRef(false);
  const launches = useLocalPreferencesStore((s) => s.launches);
  const { launchDao } = useDaoDeployment(session.address, config.name);
  const deployment = getDeploymentConfig();
  const key = `${preferenceScopeKey({ network: config.name, deployment: deployment.managerAddress, wallet: session.address || null })}:${daoId}`;
  const choice = launches[key] ?? { auction: false, marketplace: false, minter: false };

  // First visit: start from what was chosen when the community was created.
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

  const recover = Boolean(choice.hash && !['failed', 'rejected', 'expired'].includes(choice.status ?? ''));
  const confirmed = choice.status === 'confirmed';
  const admin = session.address === config.launchAdmin && session.authStatus === 'authenticated';
  const name = config.tokenName || 'this community';
  const slug = readiness?.pending?.slug;

  const change = (patch: Partial<typeof choice>) => {
    useLocalPreferencesStore.getState().setLaunch(key, { ...choice, ...patch });
    try {
      assertPreferencesSaved();
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const launch = async (rebroadcast = false) => {
    if (operation.current || !admin || !ready) return;
    operation.current = true;
    setBusy(true);
    setError('');
    try {
      if (!recover) {
        // Chain state can change between page load and signing; check again right before.
        const fresh = await readLaunchReadiness(daoId, config);
        const issues = launchReadinessIssues(fresh, config.launchAdmin);
        if (issues.length) {
          await refresh(fresh);
          throw new Error(issues.join(' '));
        }
        if (choice.minter && fresh.platformMinter !== readiness?.platformMinter)
          throw new Error('The platform minter changed. Refresh and check it again.');
      }
      await launchDao(
        daoId,
        {
          launch_auction: choice.auction,
          launch_marketplace: choice.marketplace,
          enable_minter: choice.minter,
          expected_minter: choice.minter ? readiness?.platformMinter : null
        },
        { rebroadcast }
      );
      await refresh();
      router.refresh();
    } catch (e) {
      setError(
        parseContractErrorCode(e) === 7123
          ? 'Another community launched first with your link. Pick a new link above, then launch.'
          : e instanceof Error
            ? e.message
            : 'Launch needs attention'
      );
      await refresh();
    } finally {
      setBusy(false);
      operation.current = false;
    }
  };

  if (confirmed)
    return (
      <section className={card} aria-labelledby="launch-title">
        <h2 id="launch-title" className={title}>
          {config.tokenName || 'Your community'} is live
        </h2>
        <p className={muted}>The launch went through. The directory takes a moment to catch up.</p>
        <div>
          <Button onClick={() => router.push(daoRoute(routeId))}>Go to the community</Button>
        </div>
      </section>
    );

  return (
    <section className={card} aria-labelledby="launch-title">
      <div>
        <h2 id="launch-title" className={title}>
          Launch
        </h2>
        <p className={muted}>When the steps above are done, launch opens {name} to members.</p>
      </div>

      {recover ? (
        <Callout
          variant="info"
          title="Your launch is in progress"
          description="A launch transaction was sent from this browser. Check it before trying again; don't launch twice."
        />
      ) : (
        <>
          <div className={group}>
            <h3 className={subTitle}>What starts at launch</h3>
            {config.auctionContractId ? (
              <Switch
                label="Start auctions"
                description="The first token goes up for auction right away."
                checked={choice.auction}
                disabled={!ready || busy || !admin}
                onCheckedChange={(auction) => change({ auction })}
              />
            ) : null}
            {config.marketplaceContractId ? (
              <Switch
                label="Open the market"
                description="Members can list and buy tokens."
                checked={choice.marketplace}
                disabled={!ready || busy || !admin}
                onCheckedChange={(marketplace) => change({ marketplace })}
              />
            ) : null}
            <Disclosure title="Advanced">
              <Switch
                label="Let the platform minter mint for this community"
                description="Builder's shared minter can then run claim lists for you. Leave off unless you plan to use claims."
                checked={choice.minter}
                disabled={!ready || busy || !admin || !readiness?.platformMinter}
                onCheckedChange={(minter) => change({ minter })}
              />
              {readiness?.platformMinter ? (
                <Address value={readiness.platformMinter} label="Platform minter" />
              ) : (
                <p className={hint}>No platform minter is registered on this network.</p>
              )}
            </Disclosure>
          </div>

          <div className={group}>
            <h3 className={subTitle}>What launching does</h3>
            <ul className={consequences}>
              <li>Your setup admin rights pass to the community treasury.</li>
              <li>After this, changes go through proposals that members vote on.</li>
              {slug ? <li>Your link /dao/{slug} becomes permanent.</li> : null}
            </ul>
          </div>
        </>
      )}

      {plan.blockers.map((blocker) => (
        <Callout key={blocker.id} variant="error" title={blocker.title} description={blocker.detail} />
      ))}
      {readiness?.pending ? (
        <Disclosure>
          <Address value={readiness.pending.auction_payment_asset} label="Auction payment asset" />
          <Address value={readiness.pending.marketplace_payment_asset} label="Market payment asset" />
        </Disclosure>
      ) : null}
      {error ? <Callout variant="error" title="Launch needs attention" description={error} role="alert" /> : null}

      <div className={footer}>
        <p className={hint}>
          {!admin
            ? 'Connect the launch admin wallet to launch.'
            : recover
              ? 'Checking reads the saved transaction; it never signs a new one.'
              : plan.launchHint || 'Ready when you are.'}
        </p>
        <div className={css({ display: 'flex', gap: '2', flexWrap: 'wrap' })}>
          {recover && choice.signedTxXdr ? (
            <Button variant="secondary" disabled={busy || !admin || !ready} onClick={() => void launch(true)}>
              Send it again
            </Button>
          ) : null}
          {recover ? (
            <Button loading={busy} disabled={busy || !admin || !ready} onClick={() => void launch()}>
              Check the launch
            </Button>
          ) : (
            <Button
              disabled={busy || !admin || !ready || !plan.canLaunch || Boolean(session.walletNetworkIssue)}
              loading={busy}
              onClick={() => setConfirming(true)}
            >
              <Rocket aria-hidden="true" />
              Launch {config.tokenName || 'community'}
            </Button>
          )}
        </div>
      </div>

      <Dialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Launch ${config.tokenName || 'this community'}?`}
        description="This can't be undone."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Not yet
            </Button>
            <Button
              onClick={() => {
                setConfirming(false);
                void launch();
              }}
            >
              Sign and launch
            </Button>
          </>
        }
      >
        <ul className={consequences}>
          <li>Your setup admin rights pass to the community treasury.</li>
          <li>After this, changes go through proposals.</li>
          {choice.auction ? <li>The first auction starts right away.</li> : null}
          {choice.marketplace ? <li>The market opens.</li> : null}
          {slug ? <li>/dao/{slug} becomes permanent.</li> : null}
        </ul>
      </Dialog>
    </section>
  );
}
