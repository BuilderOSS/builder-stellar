import { Plus } from 'lucide-react';
import type { Metadata } from 'next';

import { CommunityGrid } from '@/components/community/community-grid';
import { PageSection } from '@/components/page-section';
import { ButtonLink, Callout } from '@/components/ui';
import type { DaoContract } from '@/lib/contract-search';
import { type DaoConfig, getAllDaosFromDatabase, getDaoContracts, withLiveAvailability } from '@/lib/dao-db';

// Communities change as they launch; never serve a build-time snapshot.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Discover tribes',
  description: 'Find a tribe on Stellar to join, bid in, or vote with.'
};

export default async function DiscoverPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { q } = await searchParams;
  let daos: DaoConfig[] = [];
  let contracts: Record<string, DaoContract[]> = {};
  let loadError = false;
  try {
    const launched = await getAllDaosFromDatabase('operational');
    [daos, contracts] = await Promise.all([withLiveAvailability(launched), getDaoContracts(launched)]);
  } catch {
    loadError = true;
  }
  return (
    <PageSection
      title="Discover"
      description="Tribes on Stellar. Bid in an auction or buy a token to become a member and vote."
      actions={
        <ButtonLink href="/create">
          <Plus aria-hidden="true" />
          Build a tribe
        </ButtonLink>
      }
    >
      {loadError ? (
        <Callout
          variant="error"
          title="Tribes didn't load"
          description="Try again in a moment, or open a tribe directly if you have its link."
        />
      ) : null}
      <CommunityGrid daos={daos} contracts={contracts} initialQuery={typeof q === 'string' ? q : ''} />
    </PageSection>
  );
}
