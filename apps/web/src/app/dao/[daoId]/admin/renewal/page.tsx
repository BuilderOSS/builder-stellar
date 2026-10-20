'use client';

import { RenewalPanel } from '@/components/admin/renewal-panel';
import { PageSection } from '@/components/page-section';
import { useDaoContext } from '@/contexts/dao-context';

export default function RenewalPage() {
  const { daoConfig: config } = useDaoContext();
  return (
    <PageSection title="Storage renewal">
      <RenewalPanel config={config} />
    </PageSection>
  );
}
