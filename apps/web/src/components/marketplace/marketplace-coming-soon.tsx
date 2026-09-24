import { ArrowRight, Sparkles } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';

import { Card, Heading, Text } from '@/components/ui';

export function MarketplaceComingSoon({ daoName, daoHref }: { daoName?: string; daoHref?: string }) {
  const scope = daoName ? `${daoName}'s` : 'the Stellar DAO';

  return (
    <Card className="marketplace-coming-soon" p="6">
      <div className="marketplace-coming-soon__icon" aria-hidden="true">
        <Sparkles size={22} />
      </div>
      <p className="eyebrow">Coming soon</p>
      <Heading as="h2" style={{ margin: '8px 0 12px', fontSize: 'clamp(1.7rem, 4vw, 2.4rem)' }}>
        A marketplace for {scope} assets.
      </Heading>
      <Text className="lede" style={{ maxWidth: '560px' }}>
        Discover and trade DAO tokens, memberships, and collectibles across the Stellar network. We are designing the
        experience around transparent ownership and useful price history.
      </Text>
      {daoHref ? (
        <Link href={daoHref as Route} className="marketplace-coming-soon__link">
          <span className="marketplace-coming-soon__cta marketplace-coming-soon__cta--outline">
            Return to DAO <ArrowRight aria-hidden="true" size={16} />
          </span>
        </Link>
      ) : (
        <Link href="/?tab=discover" className="marketplace-coming-soon__link">
          <span className="marketplace-coming-soon__cta">
            Explore DAOs <ArrowRight aria-hidden="true" size={16} />
          </span>
        </Link>
      )}
      <div className="marketplace-coming-soon__features" aria-label="Planned marketplace features">
        <span>Global discovery</span>
        <span>Per-DAO trading</span>
        <span>Price analytics</span>
      </div>
    </Card>
  );
}
