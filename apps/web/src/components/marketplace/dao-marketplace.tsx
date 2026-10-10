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
import { daoRoute } from '@/lib/dao-routes';
import { marketplaceAssetLabel, marketplaceDisplayAmount } from '@/lib/marketplace/asset-label';
import { useDaoMarketplace, useMarketplaceListing } from '@/lib/marketplace/hooks';

import { ListingCard } from './listing-card';
import styles from './marketplace-styles';
import { SellForm } from './sell-form';

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
  selectedEventId = ''
}: {
  daoId: string;
  initialKind?: string;
  initialStatus?: string;
  selectedId?: string;
  selectedEventId?: string;
}) {
  const [kind, setKind] = useState(['primary', 'secondary'].includes(initialKind) ? initialKind : 'all');
  const [status, setStatus] = useState(
    ['all', 'open', 'purchased', 'cancelled', 'expired'].includes(initialStatus) ? initialStatus : 'open'
  );
  const [page, setPage] = useState(0);
  const [selling, setSelling] = useState(false);
  const query = new URLSearchParams({ kind, status, page: String(page) }).toString();
  const { data, error, isLoading, mutate } = useDaoMarketplace(daoId, query);
  const selected = useMarketplaceListing(daoId, initialKind, selectedId, selectedEventId);
  const purchasesEnabled = Boolean(data?.launched && data.config && !data.config.paused);
  const marketState = !data
    ? null
    : !data.community.marketplaceContract
      ? { label: "This community doesn't have a market", tone: 'neutral' as const }
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
        description="Buy a new token straight from the community, or a resale from a member. New sales fund the treasury."
        actions={
          <ButtonLink href={daoRoute(daoId, 'admin/marketplace')} variant="ghost">
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
                    {(data.config.feeBps / 100).toLocaleString()}%
                  </span>
                ) : null}
              </div>
              <p className={note}>
                Listings keep the price asset and fee they were created with. Canceling and clearing expired listings
                work even while buying is paused.
              </p>
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
                <option value="primary">New from the community</option>
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
                <option value="cancelled">Canceled</option>
                <option value="expired">Expired and cleared</option>
              </Select>
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
            </div>

            {selling ? <SellForm data={data} /> : null}
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

            {data.listings.length ? (
              <section className={styles.grid} aria-label="Listings">
                {data.listings.map((listing) => (
                  <ListingCard
                    key={listing.eventId}
                    listing={listing}
                    community={data.community}
                    network={data.network}
                    trading
                    purchasesEnabled={purchasesEnabled}
                  />
                ))}
              </section>
            ) : (
              <EmptyState title="Nothing for sale here">
                New tokens are listed by a community vote. Members can sell a token they hold with the button above.
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

            <Section title="Recent sales" description="New listing numbers are separate from token numbers.">
              {!data.sales.length ? (
                <p className={note}>No sales on this page yet.</p>
              ) : (
                <div>
                  {data.sales.map((sale) => (
                    <ListRow
                      key={sale.eventId}
                      title={`#${sale.tokenId}`}
                      meta={`${sale.kind === 'primary' ? 'New' : 'Resale'}${sale.listingId ? ` · listing ${sale.listingId}` : ''}${
                        sale.at ? ` · ${new Date(sale.at).toLocaleDateString()}` : ''
                      }${sale.fee ? ` · fee ${marketplaceDisplayAmount(data.network, sale.paymentAsset, sale.fee)}` : ''}`}
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
