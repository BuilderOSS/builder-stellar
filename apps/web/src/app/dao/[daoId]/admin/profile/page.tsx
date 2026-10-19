import { CommunityProfileEditor } from '@/components/admin/community-profile';
import { PageSection } from '@/components/page-section';

export default function CommunityProfilePage() {
  return (
    <PageSection title="Tribe profile">
      <CommunityProfileEditor />
    </PageSection>
  );
}
