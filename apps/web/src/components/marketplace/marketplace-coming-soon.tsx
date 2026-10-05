import { ArrowRight, Sparkles } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';

import { Card, Heading, Text } from '@/components/ui';

export function MarketplaceComingSoon({ daoName, daoHref }: { daoName?: string; daoHref?: string }) {
  const scope = daoName ? `${daoName}'s` : 'DAO';

  return (
    <Card className="marketplace-coming-soon" p="6">
      <div className="marketplace-coming-soon__icon" aria-hidden="true">
        <Sparkles size={22} />
      </div>
      <p className="eyebrow">Coming soon</p>
      <Heading as="h2" style={{ margin: '8px 0 12px', fontSize: 'clamp(1.7rem, 4vw, 2.4rem)' }}>
        {daoName ? `A marketplace for ${scope} assets.` : 'Marketplace browsing is coming soon.'}
      </Heading>
      <Text className="lede" style={{ maxWidth: '560px' }}>
        {daoName
          ? 'This DAO marketplace is not available yet.'
          : 'Builder does not currently show platform-wide listings. Enter a DAO to explore the market experiences it makes available.'}
      </Text>
      {daoHref ? (
        <Link href={daoHref as Route} className="marketplace-coming-soon__link">
          <span className="marketplace-coming-soon__cta marketplace-coming-soon__cta--outline">
            Return to DAO <ArrowRight aria-hidden="true" size={16} />
          </span>
        </Link>
      ) : (
        <Link href="/#discover-daos" className="marketplace-coming-soon__link">
          <span className="marketplace-coming-soon__cta">
            Explore DAOs <ArrowRight aria-hidden="true" size={16} />
          </span>
        </Link>
      )}
      <div className="marketplace-coming-soon__features" aria-label="Planned marketplace features">
        <span>DAO provenance</span>
        <span>Marketplace browsing</span>
      </div>
    </Card>
  );
}
