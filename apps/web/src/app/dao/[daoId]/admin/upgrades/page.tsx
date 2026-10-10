'use client';

import { css } from 'styled-system/css';

import { ContractUpdates } from '@/components/admin/contract-updates';
import { ModuleVersionCard } from '@/components/admin/module-version-card';
import { PageSection } from '@/components/page-section';
import { Disclosure } from '@/components/ui';
import { useDaoContext } from '@/contexts/dao-context';
import { moduleAddressKeys, type UpgradeModule } from '@/lib/admin-module-versions';

const page = css({ display: 'grid', gap: '5' });
const advanced = css({
  display: 'grid',
  gap: '4',
  gridTemplateColumns: { base: 'minmax(0, 1fr)', xl: 'repeat(2, minmax(0, 1fr))' }
});

export default function ModuleVersionsPage() {
  const { daoId, daoConfig: config } = useDaoContext();
  return (
    <PageSection
      title="Contract versions"
      description="Keep your community's contracts on their latest approved releases."
    >
      <div className={page}>
        <ContractUpdates />
        {/* For people checking a specific release by hash, or adding a storage migration by hand. */}
        <Disclosure title="Advanced: check a specific release">
          <div className={advanced}>
            {(Object.keys(moduleAddressKeys) as UpgradeModule[])
              .filter((module) => config[moduleAddressKeys[module]])
              .map((module) => (
                <ModuleVersionCard key={module} daoId={daoId} config={config} module={module} />
              ))}
          </div>
        </Disclosure>
      </div>
    </PageSection>
  );
}
