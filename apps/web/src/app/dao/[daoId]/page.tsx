'use client';

import { RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { css } from 'styled-system/css';
import useSWR from 'swr';

import { ActivityList } from '@/components/activity/activity-list';
import { DaoContractList } from '@/components/dao-contract-list';
import { MembershipCard } from '@/components/dao-home/membership-card';
import { type HomeAuction, NowCard } from '@/components/dao-home/now-card';
import { LaunchChecklist } from '@/components/launch-checklist';
import { ProposalRow } from '@/components/proposal/proposal-row';
import type { ProposalListResponse } from '@/components/proposal/types';
import { TokenCard } from '@/components/token/token-card';
import {
  Button,
  ButtonLink,
  Callout,
  Chip,
  Crest,
  CrestStripe,
  Disclosure,
  EmptyState,
  Section,
  Skeleton,
  Text
} from '@/components/ui';
import { useDaoContext } from '@/contexts/dao-context';
import { useIsLaunchAdmin } from '@/hooks/useIsLaunchAdmin';
import { getTreasuryAssets } from '@/lib/assets-config';
import { daoRoute } from '@/lib/dao-routes';
import { useGoldskyActivityFeed, useGoldskyHealth } from '@/lib/goldsky-queries';
import { ProposalState } from '@/lib/proposal-state';
import { useTokenInventory } from '@/lib/token-queries';

async function fetchJson<T>(url: string) {
  const response = await fetch(url, { cache: 'no-store' });
  const json = (await response.json()) as T & { message?: string };
  if (!response.ok) throw new Error(json.message || 'Community data unavailable');
  return json;
}

const ACTIVITY_PAGE_SIZE = 10;
const TOKEN_PAGE_SIZE = 8;
const PROPOSAL_PREVIEW = 5;

const intro = css({ display: 'grid', gap: '3', mb: { base: '5', md: '7' } });
const introRow = css({ display: 'flex', alignItems: 'center', gap: '4' });
const name = css({ textStyle: 'display', fontSize: { base: '1.875rem', md: '2.5rem' }, m: '0' });
const description = css({ textStyle: 'body', color: 'ink.muted', m: '0', maxW: '62ch' });
const columns = css({
  display: 'grid',
  gap: { base: '8', lg: '10' },
  mt: { base: '8', md: '10' },
  lg: { gridTemplateColumns: 'minmax(0, 1fr) 340px', alignItems: 'start' }
});
const mainColumn = css({ display: 'grid', gap: { base: '8', md: '10' }, minW: '0' });
const sideColumn = css({ display: 'grid', gap: '6', minW: '0', lg: { position: 'sticky', top: '20' } });
const tokenGrid = css({
  display: 'grid',
  gap: '4',
  gridTemplateColumns: { base: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))', lg: 'repeat(2, 1fr)' }
});
const more = css({ display: 'flex', justifyContent: 'center', pt: '2' });
const listSkeleton = css({ display: 'grid', gap: '3' });

export default function Page() {
  const { daoId, daoConfig: config, routeId } = useDaoContext();
  const isLaunchAdmin = useIsLaunchAdmin(config.launchAdmin);
  const isLaunchSetup = isLaunchAdmin && config.status === 'pending';
  const [activityLimit, setActivityLimit] = useState(ACTIVITY_PAGE_SIZE);
  const [tokenLimit, setTokenLimit] = useState(TOKEN_PAGE_SIZE);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState<number | null>(null);

  const health = useGoldskyHealth(daoId);
  const activity = useGoldskyActivityFeed(daoId, activityLimit);
  const tokens = useTokenInventory(daoId);
  const proposals = useSWR<ProposalListResponse>(
    `/api/dao/${encodeURIComponent(daoId)}/proposals?limit=24`,
    fetchJson,
    { keepPreviousData: true }
  );
  const auction = useSWR<HomeAuction>(
    config.auctionContractId ? `/api/dao/${encodeURIComponent(daoId)}/auctions` : null,
    fetchJson,
    { refreshInterval: 15_000 }
  );

  useEffect(() => {
    const update = () => setNow(Date.now() / 1000);
    update();
    const timer = window.setInterval(update, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const proposalItems = proposals.data?.items ?? [];
  const activeCount = proposalItems.filter((item) => item.state === ProposalState.Active).length;
  // Open votes first, then most recent.
  const proposalPreview = [...proposalItems]
    .sort((a, b) => Number(b.state === ProposalState.Active) - Number(a.state === ProposalState.Active))
    .slice(0, PROPOSAL_PREVIEW);
  const tokenItems = tokens.data?.items.slice(0, tokenLimit) ?? [];
  const assetCode =
    getTreasuryAssets(config.name).find((item) => item.contractId === auction.data?.config.payment_token)?.code ??
    'XLM';
  const indexerHealthy = health.data?.status === 'healthy';

  async function refreshAll() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await Promise.all([health.mutate(), activity.mutate(), tokens.mutate(), proposals.mutate(), auction.mutate()]);
    } finally {
      setRefreshing(false);
    }
  }

  if (config.status === 'pending' && !isLaunchAdmin) {
    return (
      <div className={intro}>
        <div className={introRow}>
          <Crest name={config.tokenName} seed={config.tokenContractId} src={config.contractImage} size="lg" />
          <h1 className={name}>{config.tokenName}</h1>
        </div>
        <Callout
          title="This community is still being set up"
          description="Its founder is finishing setup. Once it launches you can bid, join and vote here."
        />
      </div>
    );
  }

  return (
    <>
      <header className={intro}>
        <div className={introRow}>
          <Crest name={config.tokenName} seed={config.tokenContractId} src={config.contractImage} size="lg" />
          <div className={css({ display: 'grid', gap: '2', minW: '0' })}>
            <CrestStripe seed={config.tokenContractId} />
            <h1 className={name}>{config.tokenName}</h1>
          </div>
        </div>
        {config.tokenDescription ? <p className={description}>{config.tokenDescription}</p> : null}
        {isLaunchSetup ? (
          <div>
            <Chip tone="yours">You are the launch admin</Chip>
          </div>
        ) : null}
      </header>

      <NowCard
        daoId={daoId}
        name={config.tokenName}
        isLaunchSetup={isLaunchSetup}
        auction={auction.data}
        auctionLoading={auction.isLoading}
        auctionError={auction.error}
        proposalsLoading={proposals.isLoading}
        proposalsError={proposals.error}
        activeProposals={activeCount}
        hasAuctionModule={Boolean(config.auctionContractId)}
        auctionEnabled={config.auctionEnabled}
        assetCode={assetCode}
        now={now}
      />

      {isLaunchSetup ? (
        <section id="launch-checklist" aria-label="Launch setup" className={css({ mt: '8' })}>
          <LaunchChecklist daoId={daoId} config={config} />
        </section>
      ) : null}

      <div className={columns}>
        <div className={mainColumn}>
          <Section
            title="Votes"
            action={
              <ButtonLink href={daoRoute(routeId, 'proposals')} variant="ghost" size="sm">
                See all
              </ButtonLink>
            }
          >
            {proposals.error ? (
              <Callout variant="error" title="Votes didn't load" description={proposals.error.message} />
            ) : proposals.isLoading && !proposals.data ? (
              <div className={listSkeleton} role="status" aria-busy="true">
                <span className="sr-only">Loading votes</span>
                <Skeleton className={css({ height: '16' })} />
                <Skeleton className={css({ height: '16' })} />
              </div>
            ) : proposalPreview.length ? (
              <div>
                {proposalPreview.map((item) => (
                  <ProposalRow
                    key={item.proposalId}
                    item={item}
                    href={daoRoute(routeId, `proposals/${item.proposalNumber}`)}
                  />
                ))}
              </div>
            ) : (
              <EmptyState title="No proposals yet">
                When a member proposes something, everyone with a token can vote on it here.
              </EmptyState>
            )}
          </Section>

          <Section title="What's happening">
            {activity.error ? (
              <Callout variant="error" title="Activity didn't load" description={activity.error.message} />
            ) : activity.isLoading && !activity.data ? (
              <div className={listSkeleton} role="status" aria-busy="true">
                <span className="sr-only">Loading activity</span>
                {Array.from({ length: 4 }, (_, index) => (
                  <Skeleton key={index} className={css({ height: '12' })} />
                ))}
              </div>
            ) : activity.data?.items.length ? (
              <>
                <ActivityList items={activity.data.items} daoIdFor={() => daoId} />
                {activity.data.hasMore ? (
                  <div className={more}>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setActivityLimit((current) => current + ACTIVITY_PAGE_SIZE)}
                      disabled={activity.isLoading}
                    >
                      Show more
                    </Button>
                  </div>
                ) : null}
              </>
            ) : (
              <EmptyState title="Nothing yet">Proposals, votes, bids and sales show up here as they happen.</EmptyState>
            )}
          </Section>
        </div>

        <aside className={sideColumn} aria-label="Membership">
          <MembershipCard config={config} />

          <Section title="Tokens" level={3}>
            {tokens.error ? (
              <Callout variant="error" title="Tokens didn't load" description={tokens.error.message} />
            ) : tokens.isLoading && !tokens.data ? (
              <div className={tokenGrid} role="status" aria-busy="true">
                <span className="sr-only">Loading tokens</span>
                {Array.from({ length: 4 }, (_, index) => (
                  <Skeleton key={index} className={css({ aspectRatio: '1', borderRadius: 'card' })} />
                ))}
              </div>
            ) : tokens.data?.items.length ? (
              <>
                <div className={tokenGrid}>
                  {tokenItems.map((token) => (
                    <TokenCard key={token.tokenId} tokenId={token.tokenId} owner={token.owner} />
                  ))}
                </div>
                {tokens.data.items.length > tokenLimit ? (
                  <div className={more}>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setTokenLimit((current) => current + TOKEN_PAGE_SIZE)}
                    >
                      Show more tokens
                    </Button>
                  </div>
                ) : null}
              </>
            ) : (
              <Text size="sm">No tokens yet. They appear here once the first one is minted.</Text>
            )}
          </Section>
        </aside>
      </div>

      <div className={css({ mt: '12' })}>
        <Disclosure title="Technical details">
          <DaoContractList config={config} />
          <Text size="sm">
            {health.isLoading
              ? 'Checking the indexer…'
              : health.error
                ? `Indexer status unavailable: ${health.error.message}`
                : indexerHealthy
                  ? `Indexer healthy${health.data?.latestLedger ? ` · ledger ${health.data.latestLedger}` : ''}`
                  : 'The indexer needs attention; recent activity may be delayed.'}
          </Text>
          <div>
            <Button variant="secondary" size="sm" onClick={() => void refreshAll()} loading={refreshing}>
              {refreshing ? null : <RefreshCw aria-hidden="true" />}
              Refresh everything
            </Button>
          </div>
        </Disclosure>
      </div>
    </>
  );
}
