'use client';

import { LocalDrafts } from '@/components/local-workspace/local-drafts';
import { PageSection } from '@/components/page-section';

export default function DraftsPage() {
  return (
    <PageSection
      title="Drafts"
      description="Communities you started on this browser. They aren't shared or synced; clearing browser data removes them."
    >
      <LocalDrafts />
    </PageSection>
  );
}
