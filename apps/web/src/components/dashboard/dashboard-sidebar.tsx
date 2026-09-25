'use client';

import { Plus, X } from 'lucide-react';
import Link from 'next/link';

import { Text } from '@/components/ui';
import { daoRoute } from '@/lib/dao-routes';
import type { DashboardDao } from '@/lib/goldsky-queries';

function daoName(dao: DashboardDao) {
  return dao.token_name || dao.token_symbol || 'Unnamed DAO';
}

export function DashboardSidebar({
  myDaos,
  myDaosLoading,
  myDaosError,
  isOpen,
  onClose
}: {
  myDaos: DashboardDao[];
  myDaosLoading: boolean;
  myDaosError: boolean;
  isOpen: boolean;
  onClose: () => void;
}) {
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

        <div className="dashboard-sidebar__section">
          <div className="dashboard-sidebar__heading">
            <span className="label">My DAOs</span>
            <span className="dashboard-sidebar__count">{myDaos.length}</span>
          </div>
          {myDaosLoading ? (
            <Text className="dashboard-sidebar__empty">Loading your DAOs...</Text>
          ) : myDaosError ? (
            <Text className="dashboard-sidebar__empty dashboard-sidebar__error">
              Unable to load your DAOs right now.
            </Text>
          ) : myDaos.length ? (
            <nav className="dashboard-sidebar__dao-list" aria-label="Available DAOs">
              {myDaos.map((dao) => (
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
            <Text className="dashboard-sidebar__empty">You haven&apos;t joined a DAO yet.</Text>
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
