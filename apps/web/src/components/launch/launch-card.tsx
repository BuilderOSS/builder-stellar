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
import { Address, Button, ButtonLink, Callout, Dialog, Disclosure, Switch } from '@/components/ui';
import { card, muted, title } from '@/components/ui/panel-styles';
import { useDaoContext } from '@/contexts/dao-context';
import { useDeadlineClock } from '@/hooks/use-deadline-clock';
import { parseContractErrorCode } from '@/lib/contract-errors';
import type { DaoNetworkConfig } from '@/lib/dao-config';
import { daoRoute } from '@/lib/dao-routes';
import { getDeploymentConfig } from '@/lib/deployment-config';
import { launchDriveEnded } from '@/lib/launch-drive';
import type { LaunchPlan } from '@/lib/launch-steps';
import { formatClaimDate } from '@/lib/minter/display';
import { useDaoDeployment } from '@/lib/use-dao-deployment';
import { useAuthSessionStore } from '@/stores/auth-session-store';
import { useCreateDaoStore } from '@/stores/create-dao-store';
import { assertPreferencesSaved, preferenceScopeKey, useLocalPreferencesStore } from '@/stores/local-preferences-store';

import { ReleaseSlug } from './release-slug';

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
 * A launch drive is open: settings are frozen and the community launches once enough people claim,
 * with the choices made when the drive opened. Past the deadline it can never launch, only refund.
 */
export function LaunchDriveCard({
  assurance,
  name
}: {
  assurance: NonNullable<LaunchReadiness['assurance']>;
  name: string;
}) {
  const { routeId } = useDaoContext();
  const deadline = Number(assurance.deadline);
  // Re-read when the deadline passes, so the card flips to "ended" (and mounts ReleaseSlug) in place.
  const now = useDeadlineClock(deadline);
  const ended = launchDriveEnded(deadline, now);
  const { launch_auction: auction, launch_marketplace: market } = assurance.launch_config;
  return (
    <section className={card} aria-labelledby="launch-title">
      <div>
        <h2 id="launch-title" className={title}>
          {ended ? 'The launch drive ended' : 'Launch drive open'}
        </h2>
        <p className={muted}>
          {ended
            ? `${name} did not reach enough claims by ${formatClaimDate(deadline)}, so it can't launch. Everyone who paid can take their payment back on the claims page.`
            : `${name} launches once enough people claim, by ${formatClaimDate(deadline)}. Anyone can press launch on the claims page when the goal is met.`}
        </p>
      </div>
      {ended ? null : (
        <div className={group}>
          <h3 className={subTitle}>While the drive runs</h3>
          <ul className={consequences}>
            <li>The tribe belongs to its treasury. Settings, artwork and founder tokens can&apos;t change.</li>
            <li>Payments are held until launch, then go to the treasury.</li>
            <li>
              At launch:{' '}
              {[auction ? 'auctions start' : null, market ? 'the market opens' : null].filter(Boolean).join(' and ') ||
                'nothing starts on its own; a vote can start sales later'}
              .
            </li>
          </ul>
        </div>
      )}
      <div>
        <ButtonLink href={daoRoute(routeId, 'claims')} variant={ended ? 'secondary' : 'primary'}>
          {ended ? 'Go to refunds' : 'See the drive'}
        </ButtonLink>
      </div>
      {ended ? <ReleaseSlug /> : null}
    </section>
  );
}

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
  const choice = launches[key] ?? { auction: false, marketplace: false };

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
          marketplace: draft.configuration.marketplace.enabled
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
  const name = config.tokenName || 'this tribe';
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
      }
      await launchDao(
        daoId,
        { launch_auction: choice.auction, launch_marketplace: choice.marketplace },
        { rebroadcast }
      );
      await refresh();
      router.refresh();
    } catch (e) {
      setError(
        parseContractErrorCode(e) === 7123
          ? 'Another tribe launched first with your link. Pick a new link above, then launch.'
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
          {config.tokenName || 'Your tribe'} is live
        </h2>
        <p className={muted}>The launch went through. The directory takes a moment to catch up.</p>
        <div>
          <Button onClick={() => router.push(daoRoute(routeId))}>Go to the tribe</Button>
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
          </div>

          <div className={group}>
            <h3 className={subTitle}>What launching does</h3>
            <ul className={consequences}>
              <li>Your setup admin rights pass to the tribe treasury.</li>
              <li>After this, changes go through proposals that members vote on.</li>
              {config.auctionContractId && choice.auction ? (
                <li>The auction can mint one token per auction for as long as it runs.</li>
              ) : null}
              <li>Other sales (quick-buy pools, claim lists) mint only what a vote allows them.</li>
              {slug ? <li>Your link /dao/{slug} is claimed. Changing it later takes a vote.</li> : null}
            </ul>
          </div>
        </>
      )}

      {plan.blockers.map((blocker) => (
        <Callout key={blocker.id} variant="error" title={blocker.title} description={blocker.detail} />
      ))}
      {readiness?.pending ? (
        <Disclosure title="Technical details">
          {readiness.pending.auction_payment_asset ? (
            <Address value={readiness.pending.auction_payment_asset} label="Auction payment asset" />
          ) : null}
          {readiness.pending.marketplace_payment_asset ? (
            <Address value={readiness.pending.marketplace_payment_asset} label="Market payment asset" />
          ) : null}
          {readiness.pending.claims_payment_asset ? (
            <Address value={readiness.pending.claims_payment_asset} label="Claims payment asset" />
          ) : null}
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
              Launch {config.tokenName || 'tribe'}
            </Button>
          )}
        </div>
      </div>

      <Dialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Launch ${config.tokenName || 'this tribe'}?`}
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
          <li>Your setup admin rights pass to the tribe treasury.</li>
          <li>After this, changes go through proposals.</li>
          {choice.auction ? <li>The first auction starts right away.</li> : null}
          {choice.marketplace ? <li>The market opens.</li> : null}
          {slug ? <li>/dao/{slug} is claimed. Changing it later takes a vote.</li> : null}
        </ul>
      </Dialog>
    </section>
  );
}
