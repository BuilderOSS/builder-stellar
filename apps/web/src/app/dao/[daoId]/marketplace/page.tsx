import { DaoMarketplaceView } from '@/components/marketplace/dao-marketplace';
import { resolveDaoId } from '@/lib/dao-db';

export default async function DaoMarketplacePage({
  params,
  searchParams
}: {
  params: Promise<{ daoId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ daoId: routeId }, query] = await Promise.all([params, searchParams]);
  const daoId = await resolveDaoId(routeId);
  return (
    <DaoMarketplaceView
      daoId={daoId}
      initialKind={typeof query.kind === 'string' ? query.kind : 'all'}
      initialStatus={typeof query.status === 'string' ? query.status : 'open'}
      selectedId={typeof query.listing === 'string' ? query.listing : ''}
      selectedEventId={typeof query.eventId === 'string' ? query.eventId : ''}
    />
  );
}
