import { CommunityProfileEditor } from '@/components/admin/community-profile';
import { PageSection } from '@/components/page-section';

export default function CommunityProfilePage() {
  return (
    <PageSection title="Tribe profile" description="The name, image and words people see when they find your tribe.">
      <CommunityProfileEditor />
    </PageSection>
  );
}
