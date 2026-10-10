import { AdminMarketplaceView } from '@/components/marketplace/admin-marketplace';
import { resolveDaoId } from '@/lib/dao-db';

export default async function AdminMarketplacePage({ params }: { params: Promise<{ daoId: string }> }) {
  return <AdminMarketplaceView daoId={await resolveDaoId((await params).daoId)} />;
}
