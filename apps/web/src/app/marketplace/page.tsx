import type { Metadata } from 'next';

import { MarketplaceComingSoon } from '@/components/marketplace/marketplace-coming-soon';

export const metadata: Metadata = {
  title: 'Marketplace | Stellar DAOs',
  description: 'Discover and trade assets from Stellar DAOs.'
};

export default function MarketplacePage() {
  return (
    <div className="page-shell">
      <main className="app-frame standalone-page" id="main-content">
        <MarketplaceComingSoon />
      </main>
    </div>
  );
}
