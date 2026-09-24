'use client';

import { Compass, Home, Plus, X } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import { Text } from '@/components/ui';
import type { DaoConfig } from '@/lib/dao-db';
import { daoRoute } from '@/lib/dao-routes';

function daoName(dao: DaoConfig) {
  return dao.token_name || dao.label || 'Unnamed DAO';
}

export function DashboardSidebar({
  daos,
  isOpen,
  onClose
}: {
  daos: DaoConfig[];
  isOpen: boolean;
  onClose: () => void;
}) {
  const searchParams = useSearchParams();
  const isHomeActive = !searchParams.get('tab') || searchParams.get('tab') === 'feed';

  return (
    <>
      {isOpen ? (
        <button
          className="dashboard-sidebar__overlay"
          type="button"
          aria-label="Close dashboard menu"
          onClick={onClose}
        />
      ) : null}
      <aside
        className={`dashboard-sidebar${isOpen ? ' dashboard-sidebar--open' : ''}`}
        aria-label="Dashboard navigation"
      >
        <div className="dashboard-sidebar__mobile-header">
          <span className="label">Navigation</span>
          <button className="icon-button" type="button" aria-label="Close dashboard menu" onClick={onClose}>
            <X aria-hidden="true" size={18} />
          </button>
        </div>

        <nav className="dashboard-sidebar__nav" aria-label="Dashboard sections">
          <Link
            className={`dashboard-sidebar-item${isHomeActive ? ' dashboard-sidebar-item--active' : ''}`}
            href="/?tab=feed"
            onClick={onClose}
          >
            <Home aria-hidden="true" size={17} />
            <span>Home</span>
          </Link>
          <Link
            className={`dashboard-sidebar-item${searchParams.get('tab') === 'discover' ? ' dashboard-sidebar-item--active' : ''}`}
            href="/?tab=discover"
            onClick={onClose}
          >
            <Compass aria-hidden="true" size={17} />
            <span>Discover DAOs</span>
          </Link>
        </nav>

        <div className="dashboard-sidebar__section">
          <div className="dashboard-sidebar__heading">
            <span className="label">DAO directory</span>
            <span className="dashboard-sidebar__count">{daos.length}</span>
          </div>
          {daos.length ? (
            <nav className="dashboard-sidebar__dao-list" aria-label="Available DAOs">
              {daos.map((dao) => (
                <Link
                  key={dao.dao_id}
                  className="dashboard-sidebar-item dashboard-sidebar-item--dao"
                  href={daoRoute(dao.dao_id)}
                  onClick={onClose}
                >
                  <span className="dashboard-sidebar-item__avatar" aria-hidden="true">
                    {(dao.token_symbol || daoName(dao)).slice(0, 1).toUpperCase()}
                  </span>
                  <span className="dashboard-sidebar-item__name">{daoName(dao)}</span>
                </Link>
              ))}
            </nav>
          ) : (
            <Text className="dashboard-sidebar__empty">No operational DAOs yet.</Text>
          )}
        </div>

        <div className="dashboard-sidebar__actions">
          <Link className="dashboard-sidebar-item" href="/create" onClick={onClose}>
            <Plus aria-hidden="true" size={17} />
            <span>Create DAO</span>
          </Link>
        </div>
      </aside>
    </>
  );
}
