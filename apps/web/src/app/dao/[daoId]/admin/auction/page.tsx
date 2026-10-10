'use client';

import { RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { css } from 'styled-system/css';
import useSWR from 'swr';

import { AuctionSettingsBuilder } from '@/components/admin/auction-settings-builder';
import { PageSection } from '@/components/page-section';
import { Address, Callout, Chip, IconButton, Skeleton } from '@/components/ui';
import { card, fact, facts, muted, title } from '@/components/ui/panel-styles';
import { useDaoContext } from '@/contexts/dao-context';
import { treasuryIsAdmin } from '@/lib/admin-proposals';
import { useContractAdmin } from '@/lib/admin-queries';
import { useAdminTokenState } from '@/lib/admin-surfaces';
import { getTreasuryAssets } from '@/lib/assets-config';
import { formatStroops } from '@/lib/auction-values';
import { formatDuration } from '@/lib/duration';
import { useAuthSessionStore } from '@/stores/auth-session-store';

type AuctionStatus = {
  status: 'not-launched' | 'paused' | 'active';
  paused: boolean;
  auction: { token_id: string; settled: boolean } | null;
  config: {
    duration: string | number;
    reserve_price: string;
    time_buffer: string | number;
    payment_token: string;
    min_bid_increment_percent: number;
  };
};
async function fetcher(url: string): Promise<AuctionStatus> {
  const response = await fetch(url, { cache: 'no-store' });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || 'Auction status unavailable');
  return payload;
}

const page = css({ display: 'grid', gap: '5' });
const cardHead = css({ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '3' });
const factLabel = css({ textStyle: 'caption', color: 'ink.muted' });
const factValue = css({ textStyle: 'body', fontWeight: '600', color: 'ink', textAlign: 'right', minW: '0' });

export default function AuctionAdminPage() {
  const { daoId, daoConfig: config } = useDaoContext();
  const session = useAuthSessionStore();
  const [busy, setBusy] = useState(false);
  const { data, error, mutate, isLoading } = useSWR<AuctionStatus>(
    config.auctionContractId ? `/api/dao/${encodeURIComponent(daoId)}/auctions` : null,
    fetcher
  );
  const token = useAdminTokenState(config, session.address);
  const admin = useContractAdmin(config, 'auction', session.address || config.launchAdmin);
  const direct = Boolean(session.address && admin.data === session.address);
  const canPropose = Boolean(session.address && token.data?.live && treasuryIsAdmin(config, admin.data));
  const live = token.data?.live === true;
  const loading = isLoading || token.isLoading || admin.isLoading;
  const loadError = error || admin.error || token.error;
  const assetCode =
    getTreasuryAssets(config.name).find((asset) => asset.contractId === data?.config.payment_token)?.code ?? '';
  const state = !live ? 'Not launched yet' : data?.paused ? 'Paused' : 'Running';
  const long = (seconds: number) => formatDuration(seconds, { style: 'long' });

  return (
    <PageSection
      title="Auction"
      description="See how auctions run now and change their settings. After launch, changes go to a vote."
    >
      <div className={page}>
        {!config.auctionContractId ? <Callout variant="info" title="This community has no auction" /> : null}
        {loadError ? (
          <Callout variant="error" title="Auction settings didn't load" description={loadError.message} />
        ) : null}
        {!loading && !direct && !canPropose && config.auctionContractId ? (
          <Callout
            variant="info"
            title="Read only"
            description={
              live
                ? 'Members who can propose can change these by vote. Connect a member wallet to build a proposal.'
                : 'During setup, only the launch admin can change these. Connect that wallet.'
            }
          />
        ) : null}

        {loading && !data ? <Skeleton className={css({ height: '40', borderRadius: 'card' })} /> : null}

        {data ? (
          <>
            <section className={card} aria-labelledby="auction-now-title">
              <div className={cardHead}>
                <div>
                  <h2 id="auction-now-title" className={title}>
                    Auction now
                  </h2>
                  <p className={muted}>
                    {data.auction
                      ? `Token #${data.auction.token_id} · ${data.auction.settled ? 'settled' : 'not settled yet'}`
                      : 'No auction has started yet.'}
                  </p>
                </div>
                <div className={css({ display: 'flex', alignItems: 'center', gap: '1' })}>
                  <Chip tone={state === 'Running' ? 'live' : state === 'Paused' ? 'warning' : 'neutral'}>{state}</Chip>
                  <IconButton
                    label="Refresh"
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => void Promise.all([mutate(), admin.mutate(), token.mutate()])}
                  >
                    <RefreshCw aria-hidden="true" />
                  </IconButton>
                </div>
              </div>
              <dl className={facts}>
                <div className={fact}>
                  <dt className={factLabel}>Starting price</dt>
                  <dd className={factValue}>
                    {formatStroops(data.config.reserve_price)}
                    {assetCode ? ` ${assetCode}` : ''}
                  </dd>
                </div>
                <div className={fact}>
                  <dt className={factLabel}>Each auction runs for</dt>
                  <dd className={factValue}>{long(Number(data.config.duration))}</dd>
                </div>
                <div className={fact}>
                  <dt className={factLabel}>A late bid adds</dt>
                  <dd className={factValue}>{long(Number(data.config.time_buffer))}</dd>
                </div>
                <div className={fact}>
                  <dt className={factLabel}>Minimum bid increase</dt>
                  <dd className={factValue}>{data.config.min_bid_increment_percent}%</dd>
                </div>
                <div className={fact}>
                  <dt className={factLabel}>Paid in</dt>
                  <dd className={factValue}>
                    <Address value={data.config.payment_token} label={assetCode || 'Payment asset'} />
                  </dd>
                </div>
              </dl>
              <p className={muted}>The payment asset is fixed once the first auction starts.</p>
            </section>

            <AuctionSettingsBuilder
              key={`${data.paused}-${data.config.reserve_price}-${data.config.duration}-${data.config.time_buffer}-${data.config.min_bid_increment_percent}`}
              daoId={daoId}
              config={config}
              live={live}
              paused={data.paused}
              current={{
                reservePrice: String(data.config.reserve_price),
                duration: Number(data.config.duration),
                timeBuffer: Number(data.config.time_buffer),
                minBidIncrement: data.config.min_bid_increment_percent
              }}
              assetCode={assetCode}
              currentTokenId={data.auction?.token_id}
              cancellable={Boolean(live && data.auction && !data.auction.settled)}
              direct={direct}
              canPropose={canPropose}
              busy={busy}
              onBusyChange={setBusy}
              refresh={mutate}
            />
          </>
        ) : null}
      </div>
    </PageSection>
  );
}
