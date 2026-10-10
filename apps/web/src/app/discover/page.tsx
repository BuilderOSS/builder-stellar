import type { Metadata } from 'next';

import { DaoDirectory } from '@/components/dao-directory';
import { type DaoConfig, getAllDaosFromDatabase } from '@/lib/dao-db';

export const metadata: Metadata = {
  title: 'Discover communities',
  description: 'Find a community on Stellar to join, bid in, or vote with.'
};

export default async function DiscoverPage() {
  let daos: DaoConfig[] = [];
  try {
    daos = await getAllDaosFromDatabase('operational');
  } catch {
    daos = [];
  }
  return <DaoDirectory daos={daos} />;
}
