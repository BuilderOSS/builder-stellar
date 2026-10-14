'use client';

import { PageSection } from '@/components/page-section';
import { TreasuryWorkspace } from '@/components/treasury/treasury-workspace';

export default function TreasuryPage() {
  return (
    <PageSection
      title="Treasury"
      description="Money the tribe holds together. It only moves when members vote."
      daoNote="An onchain DAO treasury: every coin in and out is on the record."
    >
      <TreasuryWorkspace />
    </PageSection>
  );
}
