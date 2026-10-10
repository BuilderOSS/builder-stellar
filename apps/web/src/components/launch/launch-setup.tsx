'use client';

import { RefreshCw } from 'lucide-react';
import { css } from 'styled-system/css';
import useSWR from 'swr';

import { readLaunchReadiness } from '@/components/create-dao/launch-readiness';
import { SlugRename } from '@/components/create-dao/SlugRename';
import { Address, ButtonLink, Callout, IconButton } from '@/components/ui';
import { card, muted, title } from '@/components/ui/panel-styles';
import { useDaoContext } from '@/contexts/dao-context';
import { useGovernorSettings } from '@/lib/admin-queries';
import { useAdminArtwork } from '@/lib/admin-surfaces';
import { formatStroops } from '@/lib/auction-values';
import { votingPaceOf } from '@/lib/create-dao-presets';
import type { DaoNetworkConfig } from '@/lib/dao-config';
import { daoAdminRoute } from '@/lib/dao-routes';
import { getDeploymentConfig } from '@/lib/deployment-config';
import { formatDuration } from '@/lib/duration';
import { buildLaunchPlan } from '@/lib/launch-steps';
import { useModuleUpdates } from '@/lib/use-module-updates';
import { useAuthSessionStore } from '@/stores/auth-session-store';

import { LaunchCard } from './launch-card';
import { LaunchStepRow } from './launch-step-row';
import { SetupProgress } from './setup-progress';

const page = css({ display: 'grid', gap: '5' });
const steps = css({ listStyle: 'none', m: '0', p: '0' });
const head = css({ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '3' });

type AuctionStatus = { config: { duration: string | number; reserve_price: string } };
const fetchAuction = async (url: string): Promise<AuctionStatus> => {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error('Auction settings unavailable');
  return response.json();
};

/** Hooks shared by the setup page and the Home progress card. */
export function useLaunchPlan(daoId: string, config: DaoNetworkConfig) {
  const session = useAuthSessionStore();
  const deployment = getDeploymentConfig();
  const readiness = useSWR(
    ['launch-readiness', config.name, deployment.managerAddress, daoId],
    () => readLaunchReadiness(daoId, config),
    { refreshInterval: 15000, revalidateOnFocus: true }
  );
  const artwork = useAdminArtwork(config, session.address);
  // Only the launch admin can act on contract updates during setup, so only they pay for the reads.
  const updates = useModuleUpdates(
    config,
    session.address,
    Boolean(session.address && session.address === config.launchAdmin)
  );
  const plan = buildLaunchPlan({
    readiness: readiness.data,
    artwork: artwork.data,
    launchAdmin: config.launchAdmin,
    withdrawnContracts: updates.plan.withdrawn.length
  });
  return { readiness, artwork, plan, updates };
}

/**
 * The launch admin's path from "created" to "live": required steps in order, optional reviews of what
 * was chosen at creation, then launch. Visitors see progress only.
 */
export function LaunchSetup({ daoId, config }: { daoId: string; config: DaoNetworkConfig }) {
  const { routeId } = useDaoContext();
  const session = useAuthSessionStore();
  const { readiness, artwork, plan, updates } = useLaunchPlan(daoId, config);
  const optionalUpdates = updates.plan.actionable.filter((update) => update.status === 'available');
  const isAdmin = Boolean(session.address && session.address === config.launchAdmin);
  const auction = useSWR(
    isAdmin && config.auctionContractId ? `/api/dao/${encodeURIComponent(daoId)}/auctions` : null,
    fetchAuction
  );
  const governance = useGovernorSettings(config, session.address || undefined);
  const refresh = () => Promise.all([readiness.mutate(), artwork.mutate()]);
  const loadError = readiness.error || artwork.error;
  const name = config.tokenName || 'This community';

  if (!isAdmin)
    return (
      <section className={card} aria-labelledby="setup-title">
        <div>
          <h2 id="setup-title" className={title}>
            {name} is being set up
          </h2>
          <p className={muted}>
            Its launch admin is adding artwork and founder tokens. Members can join once it launches.
          </p>
        </div>
        <SetupProgress done={plan.doneCount} total={plan.totalCount} />
        {config.launchAdmin ? <Address value={config.launchAdmin} label="Launch admin" /> : null}
      </section>
    );

  const auctionSummary = auction.data
    ? `${formatDuration(Number(auction.data.config.duration), { style: 'long' })} each · starts at ${formatStroops(auction.data.config.reserve_price)}`
    : 'Price and timing chosen when you created it.';
  const pace = governance.data
    ? votingPaceOf({
        votingDelay: governance.data.votingDelay,
        votingPeriod: governance.data.votingPeriod,
        queueDelay: governance.data.queueDelay ?? 0,
        quorumBps: governance.data.quorumBps,
        proposalThreshold: Number(governance.data.proposalThreshold)
      })
    : null;
  const governanceSummary = governance.data
    ? `${pace ? `${pace.title}: ` : ''}votes open after ${formatDuration(governance.data.votingDelay, { style: 'long' })}, run ${formatDuration(governance.data.votingPeriod, { style: 'long' })}`
    : 'Pace chosen when you created it.';

  return (
    <div className={page}>
      <section className={card} aria-labelledby="setup-title">
        <div className={head}>
          <div>
            <h2 id="setup-title" className={title}>
              Required to launch
            </h2>
            <p className={muted}>Do these in order. Changes apply right away while you set up.</p>
          </div>
          <IconButton
            label="Check again"
            variant="ghost"
            size="sm"
            disabled={readiness.isValidating}
            onClick={() => void refresh()}
          >
            <RefreshCw aria-hidden="true" />
          </IconButton>
        </div>
        <SetupProgress done={plan.doneCount} total={plan.totalCount} />
        {loadError ? (
          <Callout variant="error" title="We couldn't check your setup" description={loadError.message} />
        ) : null}
        <ol className={steps}>
          {plan.required.map((step, index) => (
            <LaunchStepRow
              key={step.id}
              number={index + 1}
              status={step.status}
              title={step.title}
              detail={step.detail}
              caution={step.caution}
              action={
                step.id === 'artwork' && step.status !== 'loading' ? (
                  <ButtonLink
                    href={daoAdminRoute(routeId, '/artwork')}
                    variant={step.status === 'done' ? 'ghost' : 'primary'}
                    size="sm"
                  >
                    {step.status === 'done' ? 'Review artwork' : 'Add artwork'}
                  </ButtonLink>
                ) : step.id === 'contracts' ? (
                  <ButtonLink href={daoAdminRoute(routeId, '/upgrades')} size="sm">
                    Update contracts
                  </ButtonLink>
                ) : step.id === 'founders' && step.status !== 'loading' ? (
                  <ButtonLink
                    href={daoAdminRoute(routeId, '/founders')}
                    variant={
                      step.status === 'done' ? 'ghost' : plan.required[0].status === 'done' ? 'primary' : 'secondary'
                    }
                    size="sm"
                  >
                    {step.status === 'done' ? 'Mint more' : 'Mint founder tokens'}
                  </ButtonLink>
                ) : null
              }
            >
              {step.id === 'slug' && readiness.data?.pending ? (
                <SlugRename
                  daoId={daoId}
                  config={config}
                  address={session.address}
                  currentSlug={readiness.data.pending.slug}
                  onRenamed={() => void readiness.mutate()}
                />
              ) : null}
            </LaunchStepRow>
          ))}
        </ol>
      </section>

      <section className={card} aria-labelledby="review-title">
        <div>
          <h2 id="review-title" className={title}>
            Review (optional)
          </h2>
          <p className={muted}>Prefilled from when you created it. Change now, or later by a vote.</p>
        </div>
        <ul className={steps}>
          {optionalUpdates.length ? (
            <LaunchStepRow
              status="todo"
              title="Contract updates"
              detail={`${optionalUpdates.length === 1 ? '1 update is' : `${optionalUpdates.length} updates are`} available. Easiest to apply before launch, while you can sign directly.`}
              action={
                <ButtonLink href={daoAdminRoute(routeId, '/upgrades')} variant="secondary" size="sm">
                  Review
                </ButtonLink>
              }
            />
          ) : null}
          {config.auctionContractId ? (
            <LaunchStepRow
              status="done"
              title="Auctions"
              detail={auctionSummary}
              action={
                <ButtonLink href={daoAdminRoute(routeId, '/auction')} variant="ghost" size="sm">
                  Edit
                </ButtonLink>
              }
            />
          ) : null}
          <LaunchStepRow
            status="done"
            title="Voting rules"
            detail={governanceSummary}
            action={
              <ButtonLink href={daoAdminRoute(routeId, '/governance')} variant="ghost" size="sm">
                Edit
              </ButtonLink>
            }
          />
          {config.marketplaceContractId ? (
            <LaunchStepRow
              status="done"
              title="Market"
              detail="Resale fee and how tokens are listed."
              action={
                <ButtonLink href={daoAdminRoute(routeId, '/marketplace')} variant="ghost" size="sm">
                  Edit
                </ButtonLink>
              }
            />
          ) : null}
          {config.minterContractId ? (
            <LaunchStepRow
              status="done"
              title="Claims"
              detail="Lists of people who can claim a token."
              action={
                <ButtonLink href={daoAdminRoute(routeId, '/claims')} variant="ghost" size="sm">
                  Edit
                </ButtonLink>
              }
            />
          ) : null}
        </ul>
      </section>

      <LaunchCard
        daoId={daoId}
        config={config}
        readiness={readiness.data}
        plan={plan}
        refresh={(fresh) => readiness.mutate(fresh, !fresh)}
      />
    </div>
  );
}
