'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { css } from 'styled-system/css';

import { ManageDraftTray } from '@/components/admin/manage-draft-tray';
import { ManageNav } from '@/components/admin/manage-nav';
import { useDaoContext } from '@/contexts/dao-context';

const layout = css({
  display: 'grid',
  gap: { base: '5', lg: '10' },
  lg: { gridTemplateColumns: '200px minmax(0, 1fr)', alignItems: 'start' }
});
const content = css({ display: 'grid', gap: '6', minW: '0' });

/** Every Manage page shares one grouped navigation and the proposal draft tray. */
export default function ManageLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { daoId } = useDaoContext();
  const routeId = decodeURIComponent(pathname.split('/')[2] || daoId);
  const isOverview = /\/admin\/?$/.test(pathname);

  return (
    <div className={layout}>
      <ManageNav routeId={routeId} />
      <div className={content}>
        {isOverview ? null : <ManageDraftTray daoId={daoId} />}
        {children}
      </div>
    </div>
  );
}
