import type { Metadata } from 'next';
import { Suspense } from 'react';

import { HomeView } from '@/components/home/home-view';
import { getAuthSession } from '@/lib/auth/server';
import { type DaoConfig, getAllDaosFromDatabase, getPendingDaosForLaunchAdmin } from '@/lib/dao-db';

export const metadata: Metadata = {
  title: { absolute: 'Builder · Your community. Your rules. Your treasury.' },
  description: 'Start a DAO with your people, vote on what happens next, and see where the shared treasury goes.'
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
      <HomeView daos={daos} pendingDaos={pendingDaos} loadError={loadError} />
    </Suspense>
  );
}
