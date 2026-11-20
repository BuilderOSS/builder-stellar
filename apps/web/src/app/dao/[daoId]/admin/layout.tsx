'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { css } from 'styled-system/css';

import { ManageNav } from '@/components/admin/manage-nav';
import { useLaunchPlan } from '@/components/launch/launch-setup';
import { DraftDock } from '@/components/proposal-actions/draft-dock';
import { ButtonLink, Callout } from '@/components/ui';
import { useDaoContext } from '@/contexts/dao-context';
import type { DaoNetworkConfig } from '@/lib/dao-config';
import { daoRoute } from '@/lib/dao-routes';
import type { ManageModules } from '@/lib/manage-sections';

const layout = css({
  display: 'grid',
  gap: { base: '5', lg: '10' },
  lg: { gridTemplateColumns: '200px minmax(0, 1fr)', alignItems: 'start' }
});
const content = css({ display: 'grid', gap: '6', minW: '0' });

/** During setup, the nav reads the launch checklist so a finished step stops saying Required. */
function SetupManageNav({
  daoId,
  routeId,
  config,
  modules
}: {
  daoId: string;
  routeId: string;
  config: DaoNetworkConfig;
  modules: ManageModules;
}) {
  const { plan } = useLaunchPlan(daoId, config);
  const doneKeys = plan.required.filter((step) => step.status === 'done').map((step) => step.id);
  return <ManageNav routeId={routeId} inSetup modules={modules} doneKeys={doneKeys} />;
}

/** Every Manage page shares one grouped navigation and the proposal draft tray. */
export default function ManageLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { daoId, daoConfig, routeId } = useDaoContext();
  const inSetup = daoConfig.status === 'pending';
  const isOverview = /\/admin\/?$/.test(pathname);
  const modules = {
    auction: Boolean(daoConfig.auctionContractId),
    marketplace: Boolean(daoConfig.marketplaceContractId),
    claims: Boolean(daoConfig.claimsContractId)
  };

  return (
    <div className={layout}>
      {inSetup ? (
        <SetupManageNav daoId={daoId} routeId={routeId} config={daoConfig} modules={modules} />
      ) : (
        <ManageNav routeId={routeId} modules={modules} />
      )}
      <div className={content}>
        {inSetup ? (
          // Every Manage page during setup says where it fits and leads back to the checklist.
          <Callout
            variant="info"
            title="This tribe is in setup"
            description="Changes here apply right away until launch. The launch checklist shows what's required."
          >
            <div>
              <ButtonLink href={daoRoute(routeId, 'setup')} variant="secondary" size="sm">
                Back to the launch checklist
              </ButtonLink>
            </div>
          </Callout>
        ) : null}
        {/* The overview shows the dock in its own place, with the queue open. */}
        {isOverview ? null : <DraftDock daoId={daoId} />}
        {children}
      </div>
    </div>
  );
}
