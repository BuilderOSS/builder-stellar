'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { css } from 'styled-system/css';

import { Button, EmptyState, SearchInput, Select } from '@/components/ui';
import { activeNetworkLabel } from '@/lib/active-network';
import {
  type ContractQuery,
  coreContracts,
  type DaoContract,
  matchContract,
  parseContractQuery
} from '@/lib/contract-search';
import type { DaoConfig } from '@/lib/dao-db';
import { plainSummary } from '@/lib/dao-profile';
import { daoRoute, daoRouteId } from '@/lib/dao-routes';

import { CommunityCard, type CommunitySummary } from './community-card';

export function toCommunitySummary(dao: DaoConfig, yours?: string): CommunitySummary {
  return {
    id: dao.dao_id,
    routeId: daoRouteId({ daoId: dao.dao_id, slug: dao.slug }),
    name: dao.token_name || dao.label || dao.token_symbol || 'Unnamed tribe',
    symbol: dao.token_symbol,
    description: plainSummary(dao.description),
    image: dao.image,
    status: dao.status,
    hasAuction: Boolean(dao.auction_contract) && dao.auction_enabled !== false,
    hasMarket: Boolean(dao.marketplace_contract) && dao.marketplace_enabled !== false,
    auctionLive: dao.auction_live,
    forSale: dao.listings_open,
    yours
  };
}

export const communityGrid = css({
  display: 'grid',
  gap: { base: '3', md: '5' },
  gridTemplateColumns: {
    base: 'repeat(2, minmax(0, 1fr))',
    md: 'repeat(3, minmax(0, 1fr))',
    xl: 'repeat(4, minmax(0, 1fr))'
  }
});

const toolbar = css({
  display: 'grid',
  gap: '2',
  gridTemplateColumns: { base: '1fr', md: 'minmax(0, 1fr) 200px 180px' },
  alignItems: 'center'
});
const count = css({ textStyle: 'caption', color: 'ink.muted', m: '0' });

type Filter = 'all' | 'auction' | 'market';
export type CommunitySort = 'newest' | 'oldest' | 'name' | 'name-desc';

/** Orders communities by creation ledger or by name, in either direction. */
export function compareCommunities(
  sort: CommunitySort,
  a: { name: string; createdLedger?: number | null },
  b: { name: string; createdLedger?: number | null }
) {
  switch (sort) {
    case 'name':
      return a.name.localeCompare(b.name);
    case 'name-desc':
      return b.name.localeCompare(a.name);
    case 'oldest':
      return (a.createdLedger ?? 0) - (b.createdLedger ?? 0);
    default:
      return (b.createdLedger ?? 0) - (a.createdLedger ?? 0);
  }
}

/**
 * The communities a search query finds: by name, symbol or description, else by
 * any of their contract IDs (full, shortened as the app shows them, or a
 * fragment). A contract match is noted on the summary so the card can say which.
 */
export function searchCommunities(
  daos: DaoConfig[],
  contracts: Record<string, DaoContract[]> | undefined,
  query: string,
  contractQuery: ContractQuery | null = parseContractQuery(query)
) {
  const text = query.trim().toLowerCase();
  return daos.flatMap((dao) => {
    const summary = toCommunitySummary(dao);
    if (!text) return [{ dao, summary }];
    if ([summary.name, dao.token_symbol, dao.description].some((value) => value?.toLowerCase().includes(text))) {
      return [{ dao, summary }];
    }
    const contract = matchContract(contractQuery, contracts?.[dao.dao_id] ?? coreContracts(dao));
    return contract ? [{ dao, summary: { ...summary, match: { label: contract.label, id: contract.id } } }] : [];
  });
}

/** What to say when a search finds nothing, by what the query looked like. */
function emptyCopy(contractQuery: ContractQuery | null) {
  switch (contractQuery?.kind) {
    case 'full':
      return {
        title: 'No tribe uses this contract',
        body: `It isn't a contract of any launched tribe on ${activeNetworkLabel()}. Check the network, or the ID.`
      };
    case 'malformed':
      return {
        title: "That contract ID isn't valid",
        body: 'A character may be missing or mistyped. Copy it again from where you found it.'
      };
    case 'account':
      return {
        title: "That's an account address",
        body: "Search takes a tribe's name, its symbol, or one of its contract IDs, which start with C."
      };
    default:
      return { title: 'No tribe matches', body: 'Try a different name or contract ID, or start your own.' };
  }
}

/** Search, filter and sort over communities, rendered as art-first cards. */
export function CommunityGrid({
  daos,
  contracts,
  initialQuery = ''
}: {
  daos: DaoConfig[];
  /** Every contract of each tribe by dao_id, so any of them finds it; defaults to the record's own. */
  contracts?: Record<string, DaoContract[]>;
  initialQuery?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  // A navigation to another ?q= re-renders the page with a new initialQuery; follow it.
  const [seenQuery, setSeenQuery] = useState(initialQuery);
  if (initialQuery !== seenQuery) {
    setSeenQuery(initialQuery);
    setQuery(initialQuery);
  }
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<CommunitySort>('newest');
  const contractQuery = useMemo(() => parseContractQuery(query), [query]);

  // Keep the query in the URL so a search, a contract lookup most of all, can be shared.
  useEffect(() => {
    const url = new URL(window.location.href);
    const value = query.trim();
    if (value === (url.searchParams.get('q') ?? '')) return;
    if (value) url.searchParams.set('q', value);
    else url.searchParams.delete('q');
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }, [query]);

  const found = useMemo(
    () => searchCommunities(daos, contracts, query, contractQuery),
    [contractQuery, contracts, daos, query]
  );

  const visible = useMemo(() => {
    return found
      .filter(({ summary }) => {
        if (filter === 'auction' && !summary.auctionLive) return false;
        if (filter === 'market' && !summary.forSale) return false;
        return true;
      })
      .sort((a, b) =>
        compareCommunities(
          sort,
          { name: a.summary.name, createdLedger: a.dao.created_ledger },
          { name: b.summary.name, createdLedger: b.dao.created_ledger }
        )
      );
  }, [filter, found, sort]);

  const byContract =
    contractQuery?.kind === 'full' && visible.length > 0 && visible.every(({ summary }) => summary.match);
  const empty = found.length ? { title: 'No tribe matches', body: 'Try another filter.' } : emptyCopy(contractQuery);

  return (
    <div className={css({ display: 'grid', gap: '4' })}>
      <div className={toolbar} role="search">
        <SearchInput
          label="Search tribes"
          placeholder="Name, symbol or contract ID"
          value={query}
          onValueChange={setQuery}
          spellCheck={false}
          autoComplete="off"
          onKeyDown={(event) => {
            // One result, usually from a pasted contract ID: Enter opens it.
            if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
            const only = visible.length === 1 ? visible[0].summary : null;
            if (only) router.push(daoRoute(only.routeId ?? only.id));
          }}
        />
        <Select aria-label="Show" value={filter} onChange={(event) => setFilter(event.target.value as Filter)}>
          <option value="all">All tribes</option>
          <option value="auction">Auction running now</option>
          <option value="market">Tokens for sale</option>
        </Select>
        <Select aria-label="Sort" value={sort} onChange={(event) => setSort(event.target.value as CommunitySort)}>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="name">A to Z</option>
          <option value="name-desc">Z to A</option>
        </Select>
      </div>
      <p className={count} role="status" aria-live="polite">
        {visible.length} {visible.length === 1 ? 'tribe' : 'tribes'}
        {byContract ? (visible.length === 1 ? ' uses this contract' : ' use this contract') : ''}
      </p>
      {visible.length ? (
        <div className={communityGrid}>
          {visible.map(({ summary }) => (
            <CommunityCard key={summary.id} community={summary} />
          ))}
        </div>
      ) : (
        <EmptyState
          title={empty.title}
          action={
            query || filter !== 'all' ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setQuery('');
                  setFilter('all');
                }}
              >
                {filter === 'all' ? 'Clear search' : 'Clear filters'}
              </Button>
            ) : undefined
          }
        >
          {empty.body}
        </EmptyState>
      )}
    </div>
  );
}
