import type { Metadata } from 'next';
import { Suspense } from 'react';

import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { getAuthSession } from '@/lib/auth/server';
import { type DaoConfig, getAllDaosFromDatabase, getPendingDaosForLaunchAdmin } from '@/lib/dao-db';

export const metadata: Metadata = {
  title: 'Stellar DAOs',
  description: 'Your home for discovering and participating in Stellar DAOs.'
};

export default async function Page() {
  let daos: DaoConfig[] = [];
  let pendingDaos: DaoConfig[] = [];
  let loadError = false;

  try {
    const session = await getAuthSession();
    const address = session.address?.trim().toLowerCase();
    [daos, pendingDaos] = await Promise.all([
      getAllDaosFromDatabase('operational'),
      address ? getPendingDaosForLaunchAdmin(address) : Promise.resolve([])
    ]);
  } catch {
    loadError = true;
  }

  return (
    <Suspense fallback={null}>
      <DashboardShell daos={daos} pendingDaos={pendingDaos} loadError={loadError} />
    </Suspense>
  );
}
