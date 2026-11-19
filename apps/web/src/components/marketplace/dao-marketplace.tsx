'use client';

import { Tag } from 'lucide-react';
import { useState } from 'react';
import { css } from 'styled-system/css';

import { PageSection } from '@/components/page-section';
import {
  Address,
  Amount,
  Button,
  ButtonLink,
  Callout,
  Chip,
  Disclosure,
  EmptyState,
  ErrorState,
  ListRow,
  Pagination,
  Section,
  Select,
  Skeleton
} from '@/components/ui';
import { DEPLOYMENT_ID } from '@/config/deployments.generated';
import { useDaoContext } from '@/contexts/dao-context';
import { canSellOnMarket } from '@/lib/dao-nav';
import { daoRoute } from '@/lib/dao-routes';
import { formatFeePercent, parseMarketplaceAmount } from '@/lib/marketplace/amount';
import { marketplaceAssetLabel, marketplaceDisplayAmount } from '@/lib/marketplace/asset-label';
import { useDaoMarketplace, useMarketplaceListing } from '@/lib/marketplace/hooks';
import {
  isPendingListing,
  listedTokenIds,
  type ListTerms,
  parseSellParam,
  pendingListing,
  type PendingListingChange,
  unsettledChanges,
  withPendingChanges
} from '@/lib/marketplace/sell';
import type { DaoMarketplace, MarketplaceListing } from '@/lib/marketplace/types';
import { useAuthSessionStore } from '@/stores/auth-session-store';

import { ListingCard } from './listing-card';
import styles from './marketplace-styles';
import { SellForm } from './sell-form';
import { YourListings } from './your-listings';

const statusCard = css({
  display: 'grid',
  gap: '2',
  p: '4',
  borderRadius: 'card',
  bg: 'surface',
  boxShadow: 'raised'
});
const statusRow = css({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '3'
});
const note = css({ textStyle: 'caption', color: 'ink.muted', m: '0' });
const filters = css({
  display: 'grid',
  gap: '3',
  gridTemplateColumns: { base: '1fr 1fr', md: '220px 220px 1fr' },
  alignItems: 'center'
});
const sellButton = css({ gridColumn: { base: '1 / -1', md: 'auto' }, justifySelf: { md: 'end' } });

export function DaoMarketplaceView({
  daoId,
  initialKind = 'all',
  initialStatus = 'open',
  selectedId = '',
  selectedEventId = '',
  initialSell = ''
}: {
  daoId: string;
  initialKind?: string;
  initialStatus?: string;
  selectedId?: string;
  selectedEventId?: string;
  /** `?sell=<tokenId>` or `?sell=1`: open the sell form, with that token chosen. */
  initialSell?: string;
}) {
  const { routeId, daoConfig } = useDaoContext();
  // No market, a market that is off, or locked memberships: members can't list, so Sell hides.
  const canSell = canSellOnMarket(daoConfig);
  const sellLink = parseSellParam(initialSell);
  const address = useAuthSessionStore((s) => (s.authStatus === 'authenticated' ? s.address : ''));
  const [pending, setPending] = useState<PendingListingChange[]>([]);
  const [kind, setKind] = useState(['pool', 'secondary'].includes(initialKind) ? initialKind : 'all');
  const [status, setStatus] = useState(
    ['all', 'open', 'purchased', 'cancelled', 'expired'].includes(initialStatus) ? initialStatus : 'open'
  );
  const [page, setPage] = useState(0);
  const [selling, setSelling] = useState(sellLink.open && canSell);
  const waiting = pending.length > 0;
  const query = new URLSearchParams({ kind, status, page: String(page) }).toString();
  const { data, error, isLoading, mutate } = useDaoMarketplace(daoId, query, true, waiting);
  // "Yours": your open and ended resales, on any page of the main list.
  const yours = useDaoMarketplace(
    daoId,
    new URLSearchParams({ kind: 'secondary', status: 'open', seller: address }).toString(),
    Boolean(address),
    waiting
  );
  // Settle confirmed changes once the indexer returns them (checked each time new data arrives).
  const [settledFor, setSettledFor] = useState<[unknown, unknown]>([undefined, undefined]);
  if (settledFor[0] !== data || settledFor[1] !== yours.data) {
    setSettledFor([data, yours.data]);
    const left = unsettledChanges(pending, [...(data?.listings ?? []), ...(yours.data?.listings ?? [])]);
    if (left.length !== pending.length) setPending(left);
  }
  function onListed(market: DaoMarketplace, terms: ListTerms, hash: string) {
    const listing = pendingListing({
      terms,
      daoId,
      deploymentId: DEPLOYMENT_ID,
      contractId: market.community.marketplaceContract ?? '',
      seller: address,
      hash,
      priceUnits: parseMarketplaceAmount(terms.price).toString()
    });
    setPending((changes) => [...changes, { type: 'listed', listing, at: Date.now() }]);
  }
  function onCancelled(listing: MarketplaceListing, _hash: string) {
    setPending((changes) => [
      // A cancelled listing that was itself still updating is simply dropped.
      ...changes.filter((change) => change.type !== 'listed' || change.listing.eventId !== listing.eventId),
      ...(isPendingListing(listing)
        ? []
        : [
            {
              type: 'cancelled' as const,
              tokenId: listing.tokenId ?? listing.id,
              eventId: listing.eventId,
              at: Date.now()
            }
          ])
    ]);
  }
  const mine = withPendingChanges(yours.data?.listings ?? [], pending);
  // New listings show at the top of "For sale now" and "Everything" while the indexer catches up.
  const shownPending =
    ['open', 'all'].includes(status) && kind !== 'pool' && page === 0
      ? pending
      : pending.filter((change) => change.type === 'cancelled');
  const selected = useMarketplaceListing(daoId, initialKind, selectedId, selectedEventId);
  const purchasesEnabled = Boolean(data?.launched && data.config && !data.config.paused);
  const marketState = !data
    ? null
    : !data.community.marketplaceContract
      ? { label: "This tribe doesn't have a market", tone: 'neutral' as const }
      : !data.launched
        ? { label: "The market hasn't opened yet", tone: 'warning' as const }
        : !data.config
          ? { label: "We couldn't read the market's live status", tone: 'warning' as const }
          : data.config.paused
            ? { label: 'The market is paused', tone: 'warning' as const }
            : { label: 'Open for trading', tone: 'live' as const };

  return (
    <div className={styles.scoped}>
      <PageSection
        title="Market"
        actions={
          <ButtonLink href={daoRoute(routeId, 'admin/marketplace')} variant="ghost">
            Market settings
          </ButtonLink>
        }
      >
        {error ? (
          <ErrorState
            title="The market didn't load"
            cause={error.message}
            actions={
              <Button variant="secondary" onClick={() => void mutate()}>
                Try again
              </Button>
            }
          />
        ) : null}
        {isLoading ? <Skeleton className={css({ height: '24', borderRadius: 'card' })} /> : null}
        {data && marketState ? (
          <>
            <div className={statusCard}>
              <div className={statusRow}>
                <Chip tone={marketState.tone}>{marketState.label}</Chip>
                {data.config ? (
                  <span className={note}>
                    Prices in {marketplaceAssetLabel(data.network, data.config.paymentAsset)} · resale fee{' '}
                    {formatFeePercent(data.config.feeBps)}
                  </span>
                ) : null}
              </div>

              {data.configError ? <Callout variant="warning" title={data.configError} /> : null}
            </div>

            <div className={filters}>
              <Select
                aria-label="Listing type"
                value={kind}
                onChange={(e) => {
                  setKind(e.target.value);
                  setPage(0);
                }}
              >
                <option value="all">New and resale</option>
                <option value="pool">New from the tribe</option>
                <option value="secondary">Resale from members</option>
              </Select>
              <Select
                aria-label="Listing status"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(0);
                }}
              >
                <option value="open">For sale now</option>
                <option value="all">Everything</option>
                <option value="purchased">Sold</option>
                <option value="cancelled">Cancelled</option>
                <option value="expired">Expired and cleared</option>
              </Select>
              {!canSell ? null : (
                <div className={sellButton}>
                  <Button
                    variant={selling ? 'ghost' : 'secondary'}
                    aria-expanded={selling}
                    onClick={() => setSelling(!selling)}
                  >
                    <Tag aria-hidden="true" />
                    {selling ? 'Close' : 'Sell a token you own'}
                  </Button>
                </div>
              )}
            </div>

            {selling && canSell ? (
              <SellForm
                data={data}
                initialTokenId={sellLink.tokenId}
                focusOnOpen={sellLink.open}
                hiddenTokenIds={listedTokenIds(pending)}
                onListed={(terms, hash) => onListed(data, terms, hash)}
                onFinished={() => setSelling(false)}
              />
            ) : null}
            {address ? (
              <YourListings
                listings={mine}
                network={data.network}
                config={data.config}
                purchasesEnabled={purchasesEnabled}
                onCancelled={onCancelled}
                onListed={(terms, hash) => onListed(data, terms, hash)}
              />
            ) : null}
            {selected.error ? <Callout variant="error" title={selected.error.message} /> : null}
            {selected.isLoading ? <Skeleton className={css({ height: '40', borderRadius: 'card' })} /> : null}
            {selected.data ? (
              <Section title="The listing you opened">
                <ListingCard
                  key={selected.data.listing.eventId}
                  listing={selected.data.listing}
                  community={data.community}
                  network={data.network}
                  trading
                  initiallyExpanded
                  purchasesEnabled={purchasesEnabled}
                />
              </Section>
            ) : null}

            {withPendingChanges(data.listings, shownPending).length ? (
              <section className={styles.grid} aria-label="Listings">
                {withPendingChanges(data.listings, shownPending).map((listing) => (
                  <ListingCard
                    key={listing.eventId}
                    listing={listing}
                    community={data.community}
                    network={data.network}
                    trading
                    purchasesEnabled={purchasesEnabled}
                    onCancelled={(hash) => onCancelled(listing, hash)}
                  />
                ))}
              </section>
            ) : (
              <EmptyState title="Nothing for sale here">
                {canSell
                  ? 'New tokens go on sale when members vote to open a pool. Members can sell a token they hold with the button above.'
                  : 'New tokens go on sale when members vote to open a pool.'}
              </EmptyState>
            )}

            <Pagination
              label="Listing pages"
              page={page + 1}
              hasPrevious={page > 0}
              hasNext={data.hasMore || data.salesHasMore}
              onPrevious={() => setPage(page - 1)}
              onNext={() => setPage(page + 1)}
            />

            <Section title="Recent sales">
              {!data.sales.length ? (
                <p className={note}>No sales on this page yet.</p>
              ) : (
                <div>
                  {data.sales.map((sale) => (
                    <ListRow
                      key={sale.eventId}
                      title={`#${sale.tokenId}`}
                      meta={`${sale.kind === 'pool' ? 'New' : 'Resale'}${sale.poolId ? ` · pool ${sale.poolId}` : ''}${
                        sale.at ? ` · ${new Date(sale.at).toLocaleDateString()}` : ''
                      }${sale.fee ? ` · resale fee ${marketplaceDisplayAmount(data.network, sale.paymentAsset, sale.fee)}` : ''}`}
                      trailing={
                        <Amount
                          value={marketplaceDisplayAmount(data.network, sale.paymentAsset, sale.price)}
                          unit={marketplaceAssetLabel(data.network, sale.paymentAsset)}
                        />
                      }
                    />
                  ))}
                  {data.network !== 'local' ? (
                    <Disclosure title="Transactions">
                      {data.sales.map((sale) => (
                        <Address
                          key={sale.eventId}
                          value={sale.transactionHash}
                          label={`Sale of #${sale.tokenId}`}
                          compact
                        />
                      ))}
                    </Disclosure>
                  ) : null}
                </div>
              )}
            </Section>
          </>
        ) : null}
      </PageSection>
    </div>
  );
}
