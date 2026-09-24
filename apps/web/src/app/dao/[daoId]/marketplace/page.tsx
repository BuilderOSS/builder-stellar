'use client';

import { MarketplaceComingSoon } from '@/components/marketplace/marketplace-coming-soon';
import { useDaoContext } from '@/contexts/dao-context';
import { daoRoute } from '@/lib/dao-routes';

export default function DaoMarketplacePage() {
  const { daoId, daoConfig: config } = useDaoContext();

  return (
    <section className="page-section" aria-labelledby="marketplace-title">
      <div className="page-intro">
        <p className="eyebrow">{config.tokenName}</p>
        <h1 className="page-title" id="marketplace-title">
          DAO marketplace
        </h1>
        <p className="lede">A dedicated market for this DAO&apos;s tokens and memberships.</p>
      </div>
      <MarketplaceComingSoon daoName={config.tokenName} daoHref={daoRoute(daoId)} />
    </section>
  );
}
