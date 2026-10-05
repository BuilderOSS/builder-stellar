'use client';

import { Plus, X } from 'lucide-react';
import Link from 'next/link';

import type { DashboardDao } from '@/lib/goldsky-queries';

import { DashboardDaoWorlds } from './dashboard-dao-worlds';

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
          <DashboardDaoWorlds myDaos={myDaos} isLoading={myDaosLoading} hasError={myDaosError} onNavigate={onClose} />
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
