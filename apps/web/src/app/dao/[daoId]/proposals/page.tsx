'use client';

import { RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Stack } from 'styled-system/jsx';
import useSWR from 'swr';

import { PageSection } from '@/components/page-section';
import { ProposalStateBadge } from '@/components/proposal/proposal-state-badge';
import type { ProposalListResponse } from '@/components/proposal/types';
import { Button, Callout, Heading, Input, Select, Skeleton, Text } from '@/components/ui';
import { useDaoContext } from '@/contexts/dao-context';
import { daoRoute } from '@/lib/dao-routes';
import { useProposalEligibility } from '@/lib/proposal-eligibility';
import { useDaoSessionStore } from '@/stores/dao-session-store';
import { selectHasDraft, useProposalComposerStore } from '@/stores/proposal-composer-store';

function formatTimestamp(timestamp: number) {
  if (!timestamp) return '—';
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(timestamp * 1000));
  } catch {
    return String(timestamp);
  }
}

function formatVoteTotal(value: string) {
  try {
    return new Intl.NumberFormat().format(BigInt(value));
  } catch {
    return '—';
  }
}

export default function ProposalsPage() {
  const { daoId, daoConfig: config } = useDaoContext();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const router = useRouter();
  const session = useDaoSessionStore();
  const eligibility = useProposalEligibility(config, session.address);
  const hasDraft = useProposalComposerStore(selectHasDraft(session.address || null, daoId));
  const { data, error, isLoading, mutate } = useSWR<ProposalListResponse>(
    `/api/dao/${encodeURIComponent(daoId)}/proposals?limit=24`,
    async (url: string) => {
      const response = await fetch(url, { cache: 'no-store' });
      const json = (await response.json()) as ProposalListResponse;
      if (!response.ok) {
        throw new Error(json.message || 'Proposal list failed');
      }
      return json;
    },
    { keepPreviousData: true }
  );
  const items = useMemo(() => data?.items ?? [], [data?.items]);
  const statusOptions = useMemo(
    () => [...new Set(items.map((item) => item.stateLabel).filter(Boolean))].sort(),
    [items]
  );
  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return items.filter((item) => {
      const matchesStatus = status === 'all' || item.stateLabel === status;
      const matchesQuery =
        !normalizedQuery ||
        item.metadata.title.toLowerCase().includes(normalizedQuery) ||
        item.proposalId.toLowerCase().includes(normalizedQuery);
      return matchesStatus && matchesQuery;
    });
  }, [items, query, status]);
  const createDisabled = !hasDraft && !eligibility.eligible;
  const canShowProposalAction = Boolean(session.address) || !hasDraft;
  const createDisabledMessage = createDisabled ? eligibility.message : undefined;

  return (
    <PageSection title="Proposals" description="Browse proposal history and review on-chain proposal state.">
      <Stack gap="4">
        <div className="section-toolbar">
          <div className="proposal-filters" role="search">
            <Input
              type="search"
              aria-label="Search proposals"
              placeholder="Search proposals..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <Select
              aria-label="Filter proposals by status"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="all">All statuses</option>
              {statusOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <Button
              className="proposal-refresh-button"
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void mutate()}
              disabled={isLoading}
              aria-label="Refresh proposals"
              title="Refresh proposals"
            >
              <RefreshCw aria-hidden="true" className={isLoading ? 'is-spinning' : undefined} size={16} />
            </Button>
            {canShowProposalAction ? (
              <span className="proposal-create-tooltip" tabIndex={createDisabledMessage ? 0 : undefined}>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => router.push(daoRoute(daoId, 'proposals/create'))}
                  disabled={createDisabled}
                >
                  {hasDraft ? 'Continue proposal' : 'Create proposal'}
                </Button>
                {createDisabledMessage ? (
                  <span className="proposal-create-tooltip__message" role="tooltip">
                    {createDisabledMessage}
                  </span>
                ) : null}
              </span>
            ) : null}
          </div>
        </div>

        {error ? <Callout variant="error" title={error.message} /> : null}
        {isLoading && !data ? (
          <div className="proposal-list skeleton-list" role="status" aria-busy="true">
            <span className="sr-only">Loading proposals</span>
            {Array.from({ length: 5 }, (_, index) => (
              <div className="proposal-row" key={index}>
                <div className="proposal-row__identity" style={{ flex: 1 }}>
                  <Skeleton style={{ width: '42px', height: '1em' }} />
                  <div className="proposal-row__content" style={{ flex: 1 }}>
                    <Skeleton style={{ width: '58%', height: '1em' }} />
                    <Skeleton style={{ width: '30%', height: '0.8em' }} />
                  </div>
                </div>
                <div className="proposal-row__outcome">
                  <Skeleton style={{ width: '90px', height: '0.9em' }} />
                  <Skeleton style={{ width: '72px', height: '1.4em' }} />
                </div>
              </div>
            ))}
          </div>
        ) : !items.length ? (
          <div className="empty-state" role="status">
            <Heading style={{ fontSize: '1.15rem' }}>No proposals yet</Heading>
            <Text className="lede" style={{ margin: '8px auto 0' }}>
              Once an eligible member creates a proposal, its state and voting activity will appear here.
            </Text>
          </div>
        ) : !visibleItems.length ? (
          <div className="empty-state" role="status">
            <Heading style={{ fontSize: '1.15rem' }}>No matching proposals</Heading>
            <Text className="lede" style={{ margin: '8px auto 0' }}>
              Try a different search or status filter.
            </Text>
          </div>
        ) : (
          <>
            <Text className="lede" style={{ margin: 0, fontSize: '0.86rem' }} aria-live="polite">
              Showing {visibleItems.length} of {items.length}
            </Text>
            <div className="proposal-list" role="list" aria-label="Proposals in reverse chronological order">
              {visibleItems.map((item) => (
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
                        <dl className="proposal-row__votes" aria-label="Voting totals">
                          <div>
                            <dt>For</dt>
                            <dd>{formatVoteTotal(item.voteTotals.forVotes)}</dd>
                          </div>
                          <div>
                            <dt>Against</dt>
                            <dd>{formatVoteTotal(item.voteTotals.againstVotes)}</dd>
                          </div>
                          <div>
                            <dt>Abstain</dt>
                            <dd>{formatVoteTotal(item.voteTotals.abstainVotes)}</dd>
                          </div>
                        </dl>
                      ) : (
                        <Text className="proposal-row__votes-unavailable">Voting totals unavailable</Text>
                      )}
                      <ProposalStateBadge label={item.stateLabel} />
                    </div>
                  </Link>
                </div>
              ))}
            </div>
          </>
        )}
      </Stack>
    </PageSection>
  );
}
