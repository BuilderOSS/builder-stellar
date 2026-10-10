'use client';

import { useState } from 'react';
import { css } from 'styled-system/css';

import {
  Address,
  Amount,
  Avatar,
  Button,
  Chip,
  ErrorState,
  ListRow,
  Pagination,
  Section,
  Skeleton
} from '@/components/ui';
import { shortAddress } from '@/lib/activity-feed';
import { getTreasuryAssets } from '@/lib/assets-config';
import { useAuctionHistory } from '@/lib/auction-history/hooks';
import { formatAuctionAmount } from '@/lib/auction-history/state';
import type { DaoNetworkConfig } from '@/lib/dao-config';
import { daoRoute } from '@/lib/dao-routes';

const note = css({ textStyle: 'caption', color: 'ink.muted', m: '0' });
const tokenThumb = css({
  display: 'grid',
  placeItems: 'center',
  width: '10',
  height: '10',
  borderRadius: 'control',
  bg: 'hover',
  textStyle: 'micro',
  color: 'ink.muted'
});

/** Past auctions: who won each token and for how much. */
export function AuctionHistory({ config, daoId }: { config: DaoNetworkConfig; daoId: string }) {
  const [page, setPage] = useState(0);
  const { data, error, isLoading, mutate } = useAuctionHistory(config, daoId, page);
  return (
    <Section title="Past auctions">
      {error ? (
        <ErrorState
          title="Past auctions didn't load"
          cause={error.message}
          actions={
            <Button variant="secondary" onClick={() => void mutate()}>
              Try again
            </Button>
          }
        />
      ) : null}
      {isLoading && !data ? (
        <div className={css({ display: 'grid', gap: '2' })} role="status" aria-busy="true">
          <span className="sr-only">Loading past auctions</span>
          <Skeleton className={css({ height: '14' })} />
          <Skeleton className={css({ height: '14' })} />
        </div>
      ) : null}
      {data?.items.length ? (
        <div>
          {data.items.map((item) => {
            const asset = getTreasuryAssets(config.name).find((entry) => entry.contractId === item.paymentToken);
            return (
              <ListRow
                key={item.eventId}
                href={daoRoute(daoId, `token/${item.tokenId}`)}
                media={
                  item.winningBidder ? (
                    <Avatar address={item.winningBidder} />
                  ) : (
                    <span className={tokenThumb}>#{item.tokenId}</span>
                  )
                }
                title={`#${item.tokenId}`}
                meta={
                  item.outcome === 'sold'
                    ? `Won by ${shortAddress(item.winningBidder ?? undefined)}${
                        item.settledAt ? ` · ${new Date(item.settledAt).toLocaleDateString()}` : ''
                      }`
                    : item.outcome === 'unsold'
                      ? 'No bids · went to the treasury'
                      : 'Canceled'
                }
                trailing={
                  item.outcome === 'sold' ? (
                    <Amount value={formatAuctionAmount(item.amount)} unit={asset?.code ?? 'tokens'} />
                  ) : (
                    <Chip>{item.outcome === 'unsold' ? 'Unsold' : 'Canceled'}</Chip>
                  )
                }
              />
            );
          })}
        </div>
      ) : null}
      {data && !data.items.length ? <p className={note}>No finished auctions here yet.</p> : null}
      {data?.items.some(
        (item) => item.paymentToken && !getTreasuryAssets(config.name).some((a) => a.contractId === item.paymentToken)
      ) ? (
        <Address
          value={data.items.find((item) => item.paymentToken)?.paymentToken ?? ''}
          label="Payment token"
          compact
        />
      ) : null}
      <Pagination
        label="Past auction pages"
        page={page + 1}
        hasPrevious={page > 0}
        hasNext={Boolean(data?.hasMore) && !error}
        onPrevious={() => setPage(page - 1)}
        onNext={() => setPage(page + 1)}
        disabled={isLoading}
      />
      <p className={note}>Recent results can take a moment to appear.</p>
    </Section>
  );
}
