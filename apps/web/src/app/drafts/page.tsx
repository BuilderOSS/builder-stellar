'use client';

import { DraftsOverview } from '@/components/drafts/drafts-overview';
import { PageSection } from '@/components/page-section';

export default function DraftsPage() {
  return (
    <PageSection
      title="Drafts"
      description="Proposals and DAOs you started on this browser. They aren't shared or synced; clearing browser data removes them."
    >
      <DraftsOverview />
    </PageSection>
  );
}
