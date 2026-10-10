'use client';

import { Plus, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { css } from 'styled-system/css';
import useSWR from 'swr';

import { PageSection } from '@/components/page-section';
import { ProposalRow } from '@/components/proposal/proposal-row';
import type { ProposalListResponse } from '@/components/proposal/types';
import { Button, Callout, EmptyState, IconButton, SearchInput, Section, Select, Skeleton } from '@/components/ui';
import { DEPLOYMENT_ID } from '@/config/deployments.generated';
import { useDaoContext } from '@/contexts/dao-context';
import { daoRoute } from '@/lib/dao-routes';
import { useProposalEligibility } from '@/lib/proposal-eligibility';
import { ProposalState } from '@/lib/proposal-state';
import { useAuthSessionStore } from '@/stores/auth-session-store';
import { selectHasDraft, useProposalComposerStore } from '@/stores/proposal-composer-store';

const toolbar = css({
  display: 'grid',
  gap: '2',
  gridTemplateColumns: 'minmax(0, 1fr) auto',
  md: { gridTemplateColumns: 'minmax(0, 1fr) 200px auto' }
});
const statusSelect = css({ gridColumn: { base: '1 / -1', md: 'auto' }, gridRow: { base: '2', md: 'auto' } });
const hint = css({ textStyle: 'caption', color: 'ink.muted', m: '0' });
const skeletons = css({ display: 'grid', gap: '3' });

const OPEN_STATES = new Set<ProposalState>([ProposalState.Active, ProposalState.Pending]);

export default function ProposalsPage() {
  const { daoId, daoConfig: config, routeId } = useDaoContext();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const router = useRouter();
  const session = useAuthSessionStore();
  const eligibility = useProposalEligibility(config, session.address);
  const hasDraft = useProposalComposerStore(selectHasDraft(session.address || null, daoId));
  const { data, error, isLoading, mutate } = useSWR<ProposalListResponse>(
    ['proposal-list', DEPLOYMENT_ID, daoId] as const,
    async ([, , id]: readonly ['proposal-list', string, string]) => {
      const response = await fetch(`/api/dao/${encodeURIComponent(id)}/proposals?limit=24`, { cache: 'no-store' });
      const json = (await response.json()) as ProposalListResponse;
      if (!response.ok) {
        throw new Error(json.message || 'Proposal list failed');
      }
      return json;
    },
    { keepPreviousData: false, refreshInterval: 10000, revalidateOnFocus: true }
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
  const openItems = visibleItems.filter((item) => item.state !== null && OPEN_STATES.has(item.state));
  const pastItems = visibleItems.filter((item) => item.state === null || !OPEN_STATES.has(item.state));
  const createDisabled = !hasDraft && !eligibility.eligible;
  const canShowProposalAction = Boolean(session.address) || !hasDraft;
  const createDisabledMessage = createDisabled ? eligibility.message : undefined;
  const href = (proposalNumber: number) => daoRoute(routeId, `proposals/${proposalNumber}`);

  return (
    <PageSection
      title="Vote"
      description="Members propose changes and decide together. Each token is one vote."
      actions={
        canShowProposalAction ? (
          <Button onClick={() => router.push(daoRoute(routeId, 'proposals/create'))} disabled={createDisabled}>
            <Plus aria-hidden="true" />
            {hasDraft ? 'Continue your proposal' : 'New proposal'}
          </Button>
        ) : undefined
      }
    >
      {createDisabledMessage && session.address ? <p className={hint}>{createDisabledMessage}</p> : null}

      <div className={toolbar} role="search">
        <SearchInput label="Search proposals" placeholder="Search proposals" value={query} onValueChange={setQuery} />
        <div className={statusSelect}>
          <Select aria-label="Filter by status" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">All statuses</option>
            {statusOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
        </div>
        <IconButton label="Refresh proposals" variant="secondary" onClick={() => void mutate()} loading={isLoading}>
          {isLoading ? null : <RefreshCw aria-hidden="true" />}
        </IconButton>
      </div>

      {error ? <Callout variant="error" title="Proposals didn't load" description={error.message} /> : null}

      {isLoading && !data ? (
        <div className={skeletons} role="status" aria-busy="true">
          <span className="sr-only">Loading proposals</span>
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className={css({ height: '16' })} />
          ))}
        </div>
      ) : !items.length ? (
        <EmptyState title="No proposals yet">
          When a member proposes something, it shows up here for everyone to vote on.
        </EmptyState>
      ) : !visibleItems.length ? (
        <EmptyState
          title="Nothing matches"
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setQuery('');
                setStatus('all');
              }}
            >
              Clear filters
            </Button>
          }
        >
          Try a different search or status.
        </EmptyState>
      ) : (
        <>
          {openItems.length ? (
            <Section title="Open now" description={`${openItems.length} to vote on`}>
              <div>
                {openItems.map((item) => (
                  <ProposalRow key={item.proposalId} item={item} href={href(item.proposalNumber)} />
                ))}
              </div>
            </Section>
          ) : null}
          {pastItems.length ? (
            <Section title={openItems.length ? 'Past' : 'All proposals'}>
              <div>
                {pastItems.map((item) => (
                  <ProposalRow key={item.proposalId} item={item} href={href(item.proposalNumber)} />
                ))}
              </div>
            </Section>
          ) : null}
        </>
      )}
    </PageSection>
  );
}
