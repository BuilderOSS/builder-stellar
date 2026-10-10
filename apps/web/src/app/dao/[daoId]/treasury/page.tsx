'use client';

import { PageSection } from '@/components/page-section';
import { TreasuryWorkspace } from '@/components/treasury/treasury-workspace';

export default function TreasuryPage() {
  return (
    <PageSection title="Treasury" description="Contract-held assets governed by approved proposals.">
      <TreasuryWorkspace />
    </PageSection>
  );
}
