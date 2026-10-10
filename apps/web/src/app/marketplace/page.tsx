import { MarketplaceDirectoryView } from '@/components/marketplace/directory';

export const metadata = {
  title: 'Community Marketplace',
  description: 'Discover Stellar communities and trade governance NFTs.'
};
export default function MarketplacePage() {
  return <MarketplaceDirectoryView />;
}
