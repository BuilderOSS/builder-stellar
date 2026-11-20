'use client';

import { LegalExport } from '@/components/admin/legal-export';
import { PageSection } from '@/components/page-section';
import { useDaoContext } from '@/contexts/dao-context';

export default function LegalExportPage() {
  const { daoConfig: config, daoId, routeId } = useDaoContext();
  return (
    <PageSection
      guide="guides/legal/export"
      title="Legal entity export"
      description="Collect the information a DAO registrar needs to start forming a legal entity for your tribe."
    >
      <LegalExport config={config} daoId={daoId} routeId={routeId} />
    </PageSection>
  );
}
