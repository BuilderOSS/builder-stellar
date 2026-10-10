import type { Metadata } from 'next';

import { CommunityGrid } from '@/components/community/community-grid';
import { PageSection } from '@/components/page-section';
import { ButtonLink, Callout } from '@/components/ui';
import { type DaoConfig, getAllDaosFromDatabase } from '@/lib/dao-db';

export const metadata: Metadata = {
  title: 'Discover communities',
  description: 'Find a community on Stellar to join, bid in, or vote with.'
};

export default async function DiscoverPage() {
  let daos: DaoConfig[] = [];
  let loadError = false;
  try {
    daos = await getAllDaosFromDatabase('operational');
  } catch {
    loadError = true;
  }
  return (
    <PageSection
      title="Discover"
      description="Communities on Stellar. Bid in an auction or buy a token to become a member and vote."
      actions={
        <ButtonLink href="/create" variant="secondary">
          Start a DAO
        </ButtonLink>
      }
    >
      {loadError ? (
        <Callout
          variant="error"
          title="Communities didn't load"
          description="Try again in a moment, or open a community directly if you have its link."
        />
      ) : null}
      <CommunityGrid daos={daos} />
    </PageSection>
  );
}
