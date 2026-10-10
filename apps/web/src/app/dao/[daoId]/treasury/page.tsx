'use client';

import { PageSection } from '@/components/page-section';
import { TreasuryWorkspace } from '@/components/treasury/treasury-workspace';

export default function TreasuryPage() {
  return (
    <PageSection title="Treasury" description="Money the community holds together. It only moves when members vote.">
      <TreasuryWorkspace />
    </PageSection>
  );
}
