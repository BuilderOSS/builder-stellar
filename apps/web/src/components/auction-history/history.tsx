'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Stack } from 'styled-system/jsx';

import { Button, Callout, Card, Heading, ShortId, Text } from '@/components/ui';
import { getTreasuryAssets } from '@/lib/assets-config';
import { useAuctionHistory } from '@/lib/auction-history/hooks';
import { formatAuctionAmount } from '@/lib/auction-history/state';
import type { DaoNetworkConfig } from '@/lib/dao-config';

export function AuctionHistory({ config, daoId }: { config: DaoNetworkConfig; daoId: string }) {
  const [page, setPage] = useState(0);
  const { data, error, isLoading, mutate } = useAuctionHistory(config, daoId, page);
  return (
    <Card p="5">
      <Stack gap="4">
        <div>
          <Text className="label">Archive · indexed history</Text>
          <Heading>Past auctions</Heading>
        </div>
        {error ? (
          <Callout variant="error" title="History unavailable" description={error.message}>
            <Button variant="outline" onClick={() => void mutate()}>
              Retry history
            </Button>
          </Callout>
        ) : null}
        {isLoading ? <Text role="status">Loading auction history…</Text> : null}
        {data?.items.map((item) => {
          const asset = getTreasuryAssets(config.name).find((asset) => asset.contractId === item.paymentToken);
          return (
            <div key={item.eventId} style={{ borderTop: '1px solid var(--line)', paddingTop: '12px' }}>
              <Link href={`/dao/${encodeURIComponent(daoId)}/token/${item.tokenId}`}>Token #{item.tokenId}</Link>
              <Text>
                {item.outcome === 'sold'
                  ? 'Sold'
                  : item.outcome === 'unsold'
                    ? 'Unsold · transferred to treasury'
                    : 'Cancelled'}
              </Text>
              {item.winningBidder ? (
                <Link href={`/dao/${encodeURIComponent(daoId)}/members/${item.winningBidder}`}>
                  <ShortId value={item.winningBidder} label="Winner" />
                </Link>
              ) : null}
              <Text className="mono">
                {formatAuctionAmount(item.amount)} {asset?.code ?? 'SAC'}
              </Text>
              {!asset && item.paymentToken ? <ShortId value={item.paymentToken} label="Payment token" /> : null}
              {item.settledAt ? <Text>Settled {new Date(item.settledAt).toLocaleString()}</Text> : null}
            </div>
          );
        })}
        {data && !data.items.length ? <Text>No completed auctions on this page.</Text> : null}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <Button variant="outline" disabled={page === 0 || isLoading} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          <Text>Page {page + 1}</Text>
          <Button
            variant="outline"
            disabled={!data?.hasMore || isLoading || Boolean(error)}
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </div>
        <Text>History can lag confirmed transactions. Each auction uses its original payment token.</Text>
      </Stack>
    </Card>
  );
}
