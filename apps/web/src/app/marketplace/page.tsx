import { MarketplaceDirectoryView } from '@/components/marketplace/directory';

export const metadata = {
  title: 'Market',
  description: 'Buy and sell membership tokens from tribes on Stellar.'
};
export default function MarketplacePage() {
  return <MarketplaceDirectoryView />;
}
