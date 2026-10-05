'use client';

import Link from 'next/link';

import { DaoImage } from '@/components/dao-image';
import { Text } from '@/components/ui';
import { daoRoute } from '@/lib/dao-routes';
import type { DashboardDao } from '@/lib/goldsky-queries';

function daoName(dao: DashboardDao) {
  return dao.token_name || dao.token_symbol || 'Unnamed DAO';
}

export function DashboardDaoWorlds({
  myDaos,
  isLoading,
  hasError,
  onNavigate
}: {
  myDaos: DashboardDao[];
  isLoading: boolean;
  hasError: boolean;
  onNavigate?: () => void;
}) {
  if (isLoading) {
    return (
      <Text className="dashboard-worlds__empty" role="status">
        Loading your DAO worlds...
      </Text>
    );
  }

  if (hasError) {
    return (
      <Text className="dashboard-worlds__empty dashboard-worlds__error">Unable to load your DAO worlds right now.</Text>
    );
  }

  if (!myDaos.length) {
    return (
      <div className="dashboard-worlds__empty">
        <p>You have not joined a DAO world yet.</p>
        <Link href="#discover-daos">Discover DAOs</Link>
      </div>
    );
  }

  return (
    <div className="dashboard-worlds__list">
      {myDaos.map((dao) => (
        <Link key={dao.dao_id} className="dashboard-worlds__item" href={daoRoute(dao.dao_id)} onClick={onNavigate}>
          <DaoImage className="dashboard-worlds__avatar" src={dao.contract_image} alt={`${daoName(dao)} logo`} />
          <span className="dashboard-worlds__copy">
            <span className="dashboard-worlds__name">{daoName(dao)}</span>
            <span className="dashboard-worlds__meta">
              {dao.token_symbol || 'DAO'} · {dao.status}
            </span>
          </span>
          <span className="dashboard-worlds__enter">Enter</span>
        </Link>
      ))}
    </div>
  );
}
