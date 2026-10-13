'use client';

import { ListingCard } from '@/components/marketplace/listing-card';
import { ButtonLink, Section } from '@/components/ui';
import { useDaoContext } from '@/contexts/dao-context';
import { daoRoute } from '@/lib/dao-routes';
import { useDaoMarketplace } from '@/lib/marketplace/hooks';

/**
 * The community's open quick-buy pool on its home page (membership-models § 4): one card to buy
 * a new token straight from the community. Renders nothing without an open pool.
 */
export function HomePool() {
  const { daoId, routeId } = useDaoContext();
  const { data } = useDaoMarketplace(daoId, 'kind=pool&status=open');
  const pool = data?.listings.find((listing) => listing.kind === 'pool' && listing.status === 'open');
  if (!data || !pool) return null;
  const purchasesEnabled = Boolean(data.launched && data.config && !data.config.paused);
  return (
    <Section
      title="Join"
      action={
        <ButtonLink href={daoRoute(routeId, 'marketplace')} variant="ghost" size="sm">
          Market
        </ButtonLink>
      }
    >
      <ListingCard
        key={pool.eventId}
        listing={pool}
        community={data.community}
        network={data.network}
        trading
        purchasesEnabled={purchasesEnabled}
      />
    </Section>
  );
}
