import type { Metadata } from 'next';
import { Suspense } from 'react';

import { HomeView } from '@/components/home/home-view';
import { getAuthSession } from '@/lib/auth/server';
import {
  type DaoConfig,
  getAllDaosFromDatabase,
  getPendingDaosForLaunchAdmin,
  withLiveAvailability
} from '@/lib/dao-db';
import { SITE_DESCRIPTION, SITE_NAME } from '@/lib/site';

export const metadata: Metadata = {
  title: { absolute: `${SITE_NAME} · Build a tribe` },
  description: SITE_DESCRIPTION
};

export default async function Page() {
  let daos: DaoConfig[] = [];
  let pendingDaos: DaoConfig[] = [];
  let loadError = false;

  try {
    const session = await getAuthSession();
    const address = session.address?.trim().toLowerCase();
    [daos, pendingDaos] = await Promise.all([
      getAllDaosFromDatabase('operational').then(withLiveAvailability),
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
