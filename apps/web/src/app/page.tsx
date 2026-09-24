import type { Metadata } from 'next';
import { Suspense } from 'react';

import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { type DaoConfig, getAllDaosFromDatabase } from '@/lib/dao-db';

export const metadata: Metadata = {
  title: 'Stellar DAOs',
  description: 'Your home for discovering and participating in Stellar DAOs.'
};

export default async function Page() {
  let daos: DaoConfig[] = [];
  let loadError = false;

  try {
    daos = await getAllDaosFromDatabase('operational');
  } catch {
    loadError = true;
  }

  return (
    <Suspense fallback={null}>
      <DashboardShell daos={daos} loadError={loadError} />
    </Suspense>
  );
}
