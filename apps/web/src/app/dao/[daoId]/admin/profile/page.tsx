import { CommunityProfileEditor } from '@/components/admin/community-profile';
import { PageSection } from '@/components/page-section';

export default function CommunityProfilePage() {
  return (
    <PageSection
      title="Community profile"
      description="The name, image and words people see when they find your community."
    >
      <CommunityProfileEditor />
    </PageSection>
  );
}
