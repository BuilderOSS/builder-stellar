'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { css } from 'styled-system/css';

import { ManageDraftTray } from '@/components/admin/manage-draft-tray';
import { ManageNav } from '@/components/admin/manage-nav';
import { ButtonLink, Callout } from '@/components/ui';
import { useDaoContext } from '@/contexts/dao-context';
import { daoRoute } from '@/lib/dao-routes';

const layout = css({
  display: 'grid',
  gap: { base: '5', lg: '10' },
  lg: { gridTemplateColumns: '200px minmax(0, 1fr)', alignItems: 'start' }
});
const content = css({ display: 'grid', gap: '6', minW: '0' });

/** Every Manage page shares one grouped navigation and the proposal draft tray. */
export default function ManageLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { daoId, daoConfig, routeId } = useDaoContext();
  const inSetup = daoConfig.status === 'pending';
  const isOverview = /\/admin\/?$/.test(pathname);

  return (
    <div className={layout}>
      <ManageNav routeId={routeId} inSetup={inSetup} />
      <div className={content}>
        {inSetup ? (
          // Every Manage page during setup says where it fits and leads back to the checklist.
          <Callout
            variant="info"
            title="You're setting up"
            description="Changes here apply right away until launch. The launch checklist shows what's required."
          >
            <div>
              <ButtonLink href={daoRoute(routeId, 'setup')} variant="secondary" size="sm">
                Back to the launch checklist
              </ButtonLink>
            </div>
          </Callout>
        ) : null}
        {isOverview ? null : <ManageDraftTray daoId={daoId} />}
        {children}
      </div>
    </div>
  );
}
