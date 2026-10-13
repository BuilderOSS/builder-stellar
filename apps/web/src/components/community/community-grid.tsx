'use client';

import { useMemo, useState } from 'react';
import { css } from 'styled-system/css';

import { Button, EmptyState, SearchInput, Select } from '@/components/ui';
import type { DaoConfig } from '@/lib/dao-db';
import { plainSummary } from '@/lib/dao-profile';
import { daoRouteId } from '@/lib/dao-routes';

import { CommunityCard, type CommunitySummary } from './community-card';

export function toCommunitySummary(dao: DaoConfig, yours?: string): CommunitySummary {
  return {
    id: dao.dao_id,
    routeId: daoRouteId({ daoId: dao.dao_id, slug: dao.slug }),
    name: dao.token_name || dao.label || dao.token_symbol || 'Unnamed community',
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

/** Search, filter and sort over communities, rendered as art-first cards. */
export function CommunityGrid({ daos }: { daos: DaoConfig[] }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<CommunitySort>('newest');

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return daos
      .map((dao) => ({ dao, summary: toCommunitySummary(dao) }))
      .filter(({ dao, summary }) => {
        if (filter === 'auction' && !summary.auctionLive) return false;
        if (filter === 'market' && !summary.forSale) return false;
        if (!normalized) return true;
        return [summary.name, dao.token_symbol, dao.description, dao.dao_id].some((value) =>
          value?.toLowerCase().includes(normalized)
        );
      })
      .sort((a, b) =>
        compareCommunities(
          sort,
          { name: a.summary.name, createdLedger: a.dao.created_ledger },
          { name: b.summary.name, createdLedger: b.dao.created_ledger }
        )
      );
  }, [daos, filter, query, sort]);

  return (
    <div className={css({ display: 'grid', gap: '4' })}>
      <div className={toolbar} role="search">
        <SearchInput
          label="Search communities"
          placeholder="Search by name or symbol"
          value={query}
          onValueChange={setQuery}
        />
        <Select aria-label="Show" value={filter} onChange={(event) => setFilter(event.target.value as Filter)}>
          <option value="all">All communities</option>
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
        {visible.length} {visible.length === 1 ? 'community' : 'communities'}
      </p>
      {visible.length ? (
        <div className={communityGrid}>
          {visible.map(({ summary }) => (
            <CommunityCard key={summary.id} community={summary} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="No community matches"
          action={
            query || filter !== 'all' ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setQuery('');
                  setFilter('all');
                }}
              >
                Clear filters
              </Button>
            ) : undefined
          }
        >
          Try a different name, or start your own.
        </EmptyState>
      )}
    </div>
  );
}
