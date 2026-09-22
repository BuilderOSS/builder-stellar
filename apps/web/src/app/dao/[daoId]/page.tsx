'use client';

import { Activity, ChevronDown, MoreHorizontal, RefreshCw } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Stack } from 'styled-system/jsx';
import useSWR from 'swr';

import { PageSection } from '@/components/page-section';
import { ProposalStateBadge } from '@/components/proposal/proposal-state-badge';
import type { ProposalListResponse } from '@/components/proposal/types';
import { TokenCard } from '@/components/token/token-card';
import { Button, Callout, Card, Heading, ShortId, Text } from '@/components/ui';
import { useDaoContext } from '@/contexts/dao-context';
import { useGoldskyActivityFeed, useGoldskyHealth } from '@/lib/goldsky-queries';
import { useTokenInventory } from '@/lib/token-queries';

function formatTimestamp(timestamp: string | number | null) {
  const numericTimestamp = Number(timestamp ?? 0);
  if (!numericTimestamp) return '—';
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(numericTimestamp * 1000)
    );
  } catch {
    return String(timestamp);
  }
}

type AuctionData = {
  auction: {
    token_id: string;
    start_time: string;
    end_time: string;
    highest_bid: string;
    highest_bidder: string | null;
    settled: boolean;
  };
  config: { reserve_price: string; min_bid_increment_percent: number; payment_token: string | null };
  paused: boolean;
};

async function fetchJson<T>(url: string) {
  const response = await fetch(url, { cache: 'no-store' });
  const json = (await response.json()) as T & { message?: string };
  if (!response.ok) throw new Error(json.message || 'Dashboard data unavailable');
  return json;
}

function formatVoteTotal(value: string) {
  try {
    return new Intl.NumberFormat().format(BigInt(value));
  } catch {
    return '—';
  }
}

function formatAuctionAmount(value: string | undefined) {
  if (!value) return '0';
  const raw = BigInt(value);
  const whole = raw / 10_000_000n;
  const fraction = (raw % 10_000_000n).toString().padStart(7, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

const ACTIVITY_PAGE_SIZE = 10;
const TOKEN_PAGE_SIZE = 8;

export default function Page() {
  const { daoId, daoConfig: config } = useDaoContext();
  const [activityLimit, setActivityLimit] = useState(ACTIVITY_PAGE_SIZE);
  const [tokenLimit, setTokenLimit] = useState(TOKEN_PAGE_SIZE);
  const [refreshingDashboard, setRefreshingDashboard] = useState(false);
  const [currentTime, setCurrentTime] = useState<number | null>(null);
  const {
    data: goldskyHealth,
    error: goldskyHealthError,
    isLoading: goldskyHealthLoading,
    isValidating: goldskyHealthRefreshing,
    mutate: refreshHealth
  } = useGoldskyHealth(daoId);
  const {
    data: activityFeed,
    error: activityError,
    isLoading: activityLoading,
    isValidating: activityRefreshing,
    mutate: refreshFeed
  } = useGoldskyActivityFeed(daoId, activityLimit);
  const {
    data: tokens,
    error: tokenError,
    isLoading: tokenLoading,
    isValidating: tokenRefreshing,
    mutate: refreshTokens
  } = useTokenInventory(daoId);
  const {
    data: proposals,
    error: proposalsError,
    isLoading: proposalsLoading,
    mutate: refreshProposals
  } = useSWR<ProposalListResponse>(`/api/dao/${daoId}/proposals?limit=24`, fetchJson, { keepPreviousData: true });
  const {
    data: auctionData,
    error: auctionError,
    isLoading: auctionLoading,
    mutate: refreshAuction
  } = useSWR<AuctionData>(`/api/dao/${daoId}/auctions`, fetchJson, { refreshInterval: 15_000 });
  const tokenItems = tokens?.items.slice(0, tokenLimit) ?? [];
  const canLoadMoreTokens = Boolean(tokens && tokens.items.length > tokenLimit);
  const activityItems = activityFeed?.items ?? [];
  const proposalItems = proposals?.items ?? [];
  const canLoadMoreActivity = Boolean(activityFeed?.hasMore);
  const indexerIsHealthy = goldskyHealth?.status === 'healthy';
  const indexerHealthLabel = goldskyHealthLoading
    ? 'Checking indexer health'
    : goldskyHealthError
      ? 'Indexer health unavailable'
      : indexerIsHealthy
        ? 'Indexer healthy'
        : 'Indexer needs attention';
  const isDashboardRefreshing =
    refreshingDashboard ||
    goldskyHealthLoading ||
    goldskyHealthRefreshing ||
    activityLoading ||
    activityRefreshing ||
    tokenLoading ||
    tokenRefreshing ||
    proposalsLoading ||
    auctionLoading;
  const auctionEndTime = auctionData?.auction ? Number(auctionData.auction.end_time) : null;
  const isAuctionEnded = currentTime !== null && auctionEndTime !== null && auctionEndTime <= currentTime;

  useEffect(() => {
    const updateCurrentTime = () => setCurrentTime(Date.now() / 1000);
    updateCurrentTime();
    const timer = window.setInterval(updateCurrentTime, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  async function refreshDashboard() {
    if (isDashboardRefreshing) return;
    setRefreshingDashboard(true);
    try {
      await Promise.all([refreshHealth(), refreshFeed(), refreshTokens(), refreshProposals(), refreshAuction()]);
    } finally {
      setRefreshingDashboard(false);
    }
  }

  return (
    <PageSection title="Dashboard" description="Your DAO activity at a glance.">
        <div className="dashboard-controls">
          {isDashboardRefreshing ? (
            <Text className="dashboard-sync-status" role="status" aria-live="polite">
              Syncing…
            </Text>
          ) : null}
          <details className="dashboard-menu">
            <summary className="dashboard-menu__trigger">
              Contracts <ChevronDown aria-hidden="true" size={14} />
            </summary>
            <div className="dashboard-menu__panel dashboard-contract-menu">
              <Text className="label">Contracts</Text>
              <div className="dashboard-contract-menu__items">
                {config.tokenContractId ? (
                  <ShortId label="Token" value={config.tokenContractId} />
                ) : (
                  <Text>Token: Missing</Text>
                )}
                {config.governorContractId ? (
                  <ShortId label="Governor" value={config.governorContractId} />
                ) : (
                  <Text>Governor: Missing</Text>
                )}
                {config.treasuryContractId ? (
                  <ShortId label="Treasury" value={config.treasuryContractId} />
                ) : (
                  <Text>Treasury: Missing</Text>
                )}
                {config.auctionContractId ? (
                  <ShortId label="Auction" value={config.auctionContractId} />
                ) : (
                  <Text>Auction: Missing</Text>
                )}
                <ShortId label="Admin" value={config.adminAddress} />
              </div>
            </div>
          </details>
          <details className="dashboard-menu dashboard-menu--options">
            <summary
              className="dashboard-menu__trigger dashboard-menu__trigger--icon"
              aria-label="Dashboard options"
              title="Dashboard options"
            >
              <MoreHorizontal aria-hidden="true" size={18} />
            </summary>
            <div className="dashboard-menu__panel dashboard-options-menu">
              <Text className="label">Dashboard options</Text>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void refreshDashboard()}
                disabled={isDashboardRefreshing}
              >
                <RefreshCw aria-hidden="true" className={isDashboardRefreshing ? 'is-spinning' : undefined} size={15} />
                {isDashboardRefreshing ? 'Refreshing…' : 'Refresh dashboard'}
              </Button>
            </div>
          </details>
        </div>

        <div className="dashboard-secondary-grid">
          <Card className="dashboard-secondary-card" p="5">
            <div className="dashboard-secondary-card__content">
              <Heading style={{ fontSize: '1.35rem', margin: 0 }}>Auction</Heading>
              <div className="dashboard-secondary-card__scroll">
                {auctionError ? (
                  <Callout variant="error" title="Auction unavailable" description={auctionError.message} />
                ) : null}
                {auctionLoading && !auctionData ? (
                  <Text className="lede" style={{ margin: 0 }}>
                    Loading auction...
                  </Text>
                ) : null}
                {auctionData?.auction ? (
                  <div className="dashboard-auction">
                    <Link href={`/dao/${daoId}/auctions`}>
                      <Image
                        src={`/api/render/${daoId}/${auctionData.auction.token_id}/image.svg`}
                        alt={`Token #${auctionData.auction.token_id}`}
                        width={240}
                        height={240}
                        unoptimized
                      />
                    </Link>
                    <div className="dashboard-auction__details">
                      <div>
                        <Text className="label" style={{ margin: 0 }}>
                          Current auction
                        </Text>
                        <Heading style={{ fontSize: '1.1rem', margin: '4px 0 0' }}>
                          Token #{auctionData.auction.token_id}
                        </Heading>
                        <Text className="lede" style={{ margin: '8px 0 0' }}>
                          {auctionData.auction.highest_bid === '0'
                            ? `Reserve ${formatAuctionAmount(auctionData.config.reserve_price)}`
                            : `Highest bid ${formatAuctionAmount(auctionData.auction.highest_bid)}`}
                        </Text>
                        <Text className="lede" style={{ margin: '4px 0 0', fontSize: '0.84rem' }}>
                          Ends {formatTimestamp(auctionData.auction.end_time)}
                        </Text>
                      </div>
                      {!auctionData.paused ? (
                        <Link className="dashboard-auction__action" href={`/dao/${daoId}/auctions`}>
                          {isAuctionEnded ? 'Settle auction' : 'Place bid'}
                        </Link>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {!auctionLoading && auctionData && !auctionData.auction ? (
                  <div className="empty-state" role="status">
                    <Text className="lede" style={{ margin: '0 auto' }}>
                      Current auction data is unavailable.
                    </Text>
                  </div>
                ) : null}
              </div>
            </div>
          </Card>
          <Card className="dashboard-secondary-card" p="5">
            <div className="dashboard-secondary-card__content">
              <Heading style={{ fontSize: '1.35rem', margin: 0 }}>Proposal activity</Heading>
              <div className="dashboard-secondary-card__scroll">
                {proposalsError ? (
                  <Callout variant="error" title="Proposal activity unavailable" description={proposalsError.message} />
                ) : null}
                {proposalsLoading && !proposals ? <Callout variant="info" title="Loading proposal activity…" /> : null}
                {!proposalsLoading && !proposalItems.length ? (
                  <div className="empty-state" role="status">
                    <Text className="lede" style={{ margin: '0 auto' }}>
                      Proposal activity will appear here once proposals are indexed.
                    </Text>
                  </div>
                ) : null}
                {proposalItems.length ? (
                  <div className="dashboard-proposal-list proposal-list" role="list" aria-label="Recent proposals">
                    {proposalItems.map((item) => (
                      <div key={item.proposalId} role="listitem">
                        <Link className="proposal-row" href={`/dao/${daoId}/proposals/${item.proposalNumber}`}>
                          <div className="proposal-row__identity">
                            <Text className="proposal-row__id mono">#{item.proposalNumber}</Text>
                            <div className="proposal-row__content">
                              <Heading className="proposal-row__title">{item.metadata.title}</Heading>
                              <Text className="proposal-row__date">{formatTimestamp(item.timestamp)}</Text>
                            </div>
                          </div>
                          <div className="proposal-row__outcome">
                            {item.voteTotals ? (
                              <div
                                className="dashboard-vote-totals mono"
                                aria-label={`For ${formatVoteTotal(item.voteTotals.forVotes)}, against ${formatVoteTotal(item.voteTotals.againstVotes)}, abstain ${formatVoteTotal(item.voteTotals.abstainVotes)}`}
                              >
                                <span className="dashboard-vote-totals__for">
                                  {formatVoteTotal(item.voteTotals.forVotes)}
                                </span>
                                <span>/</span>
                                <span className="dashboard-vote-totals__against">
                                  {formatVoteTotal(item.voteTotals.againstVotes)}
                                </span>
                                <span>/</span>
                                <span className="dashboard-vote-totals__abstain">
                                  {formatVoteTotal(item.voteTotals.abstainVotes)}
                                </span>
                              </div>
                            ) : null}
                            <ProposalStateBadge label={item.stateLabel} />
                          </div>
                        </Link>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </Card>
        </div>

        <Card className="dashboard-feed-card" p="5">
          <Stack gap="3">
            <div className="section-toolbar">
              <Heading style={{ fontSize: '1.35rem', margin: 0 }}>Activity feed</Heading>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <details className="dashboard-health-menu">
                  <summary
                    className="dashboard-health-trigger"
                    aria-label={`${indexerHealthLabel}. View indexer health`}
                    title={indexerHealthLabel}
                  >
                    <Activity aria-hidden="true" size={16} />
                    <span
                      className={`dashboard-health-dot${indexerIsHealthy ? ' dashboard-health-dot--healthy' : ''}`}
                      aria-hidden="true"
                    />
                  </summary>
                  <div className="dashboard-health-panel">
                    <div className="dashboard-health-panel__heading">
                      <Text className="label">Indexer health</Text>
                    </div>
                    <Text className="lede" style={{ margin: 0, fontSize: '0.84rem' }}>
                      {indexerHealthLabel}
                    </Text>
                    {goldskyHealthError ? (
                      <Text className="lede" style={{ margin: 0, fontSize: '0.8rem' }}>
                        {goldskyHealthError.message}
                      </Text>
                    ) : null}
                    {goldskyHealth ? (
                      <div className="dashboard-health-program">
                        <Text style={{ margin: 0, fontWeight: 700 }}>Goldsky index</Text>
                        <Text className="lede" style={{ margin: 0, fontSize: '0.78rem' }}>
                          {goldskyHealth.latestLedger ? `Ledger ${goldskyHealth.latestLedger}` : 'No ledger data'} |{' '}
                          {goldskyHealth.totalEvents ?? 0} indexed events
                        </Text>
                      </div>
                    ) : null}
                  </div>
                </details>
              </div>
            </div>
            {activityError ? (
              <Callout variant="error" title="Activity feed unavailable" description={activityError.message} />
            ) : null}
            {!activityItems.length ? (
              <div className="empty-state" role="status">
                <Text className="lede" style={{ margin: '0 auto' }}>
                  No indexed activity yet. Governance and token events will appear here.
                </Text>
              </div>
            ) : null}
            {activityItems.length ? (
              <>
                <div className="dashboard-activity-scroll">
                  <div className="dashboard-activity-list">
                    {activityItems.map((item, index) => (
                      <div
                        className="dashboard-activity-row"
                        data-first={index === 0 ? 'true' : undefined}
                        key={item.activity_id}
                      >
                        <div>
                          <Text style={{ margin: 0, fontWeight: 700 }}>{item.title}</Text>
                          <Text className="lede" style={{ margin: '4px 0 0', fontSize: '0.9rem' }}>
                            {item.summary}
                          </Text>
                        </div>
                        <Text className="lede dashboard-activity-meta">
                          {formatTimestamp(item.timestamp)} | Ledger {item.ledger_sequence} | {item.contract_role}
                        </Text>
                      </div>
                    ))}
                  </div>
                </div>
                {canLoadMoreActivity ? (
                  <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '8px' }}>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setActivityLimit((current) => current + ACTIVITY_PAGE_SIZE)}
                      disabled={activityLoading}
                    >
                      {activityLoading ? 'Loading...' : 'Show more activity'}
                    </Button>
                  </div>
                ) : null}
              </>
            ) : null}
          </Stack>
        </Card>

        <Card className="dashboard-membership-card" p="5">
          <div className="dashboard-membership-card__content">
            <Heading style={{ fontSize: '1.35rem', margin: 0 }}>Membership</Heading>
            <div className="dashboard-membership-card__scroll">
              {tokenError ? (
                <Callout variant="error" title="Token inventory unavailable" description={tokenError.message} />
              ) : null}
              {!tokenLoading && !tokens?.items.length ? (
                <div className="empty-state" role="status">
                  <Text className="lede" style={{ margin: '0 auto' }}>
                    No tokens have been indexed yet. Refresh after the first mint is confirmed.
                  </Text>
                </div>
              ) : null}
              {tokens?.items.length ? (
                <>
                  <div className="token-inventory-grid">
                    {tokenItems.map((token) => (
                      <TokenCard key={token.tokenId} tokenId={token.tokenId} owner={token.owner} />
                    ))}
                  </div>
                  {canLoadMoreTokens ? (
                    <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '8px' }}>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setTokenLimit((current) => current + TOKEN_PAGE_SIZE)}
                        disabled={tokenLoading}
                      >
                        {tokenLoading ? 'Loading...' : 'Show more tokens'}
                      </Button>
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>
          <style jsx>{`
            .token-inventory-grid {
              display: grid;
              gap: 18px;
              grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
            }
            @media (min-width: 768px) {
              .token-inventory-grid {
                gap: 20px;
                grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
              }
            }
          `}</style>
        </Card>
      </PageSection>
  );
}
