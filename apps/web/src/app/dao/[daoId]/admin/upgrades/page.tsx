'use client';

import { Grid, Stack } from 'styled-system/jsx';

import { AdminSurfaceNav as AdminSectionNav } from '@/components/admin/admin-surface-nav';
import { ModuleVersionCard } from '@/components/admin/module-version-card';
import { PageSection } from '@/components/page-section';
import { Callout } from '@/components/ui';
import { useDaoContext } from '@/contexts/dao-context';
import { moduleAddressKeys, type UpgradeModule } from '@/lib/admin-module-versions';

export default function ModuleVersionsPage() {
  const { daoId, daoConfig: config } = useDaoContext();
  return (
    <PageSection
      title="Module versions and upgrades"
      description="Compare current code hashes with the Manager registry and check approved transitions."
    >
      <Stack gap="4">
        <AdminSectionNav daoId={daoId} active="/upgrades" />
        <Callout
          variant="info"
          title="Approval is not an automatic upgrade"
          description="Review release compatibility before proposing a transition. Execution checks the exact current hash and Manager approval again. This page does not upload WASM, register releases, or grant approval."
        />
        <Grid columns={{ base: 1, xl: 2 }} gap="4">
          {(Object.keys(moduleAddressKeys) as UpgradeModule[])
            .filter((module) => config[moduleAddressKeys[module]])
            .map((module) => (
              <ModuleVersionCard key={module} daoId={daoId} config={config} module={module} />
            ))}
        </Grid>
      </Stack>
    </PageSection>
  );
}
