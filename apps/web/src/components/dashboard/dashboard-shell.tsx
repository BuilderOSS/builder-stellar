'use client';

import { Menu, Plus } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';

import { DaoDirectory } from '@/components/dao-directory';
import { MarketplaceComingSoon } from '@/components/marketplace/marketplace-coming-soon';
import { Callout, Heading, Text } from '@/components/ui';
import { WalletControls } from '@/components/wallet-controls';
import type { DaoConfig } from '@/lib/dao-db';

import { DashboardSidebar } from './dashboard-sidebar';
import { type DashboardTab, DashboardTabs } from './dashboard-tabs';

function EmptyDashboardTab({ tab }: { tab: Exclude<DashboardTab, 'discover' | 'marketplace'> }) {
  const copy =
    tab === 'feed'
      ? ['Your activity feed is quiet', 'Join a DAO to see proposals, votes, and treasury activity here.']
      : ['No DAOs yet', 'Your DAOs will appear here once membership data is connected.'];

  return (
    <div className="dashboard-empty-state" role="status">
      <p className="eyebrow">{tab === 'feed' ? 'Personalized activity' : 'Your communities'}</p>
      <Heading style={{ fontSize: '1.35rem', margin: '8px 0' }}>{copy[0]}</Heading>
      <Text className="lede">{copy[1]}</Text>
    </div>
  );
}

export function DashboardShell({ daos, loadError }: { daos: DaoConfig[]; loadError: boolean }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="page-shell dashboard-page-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <div className="app-frame dashboard-frame">
        <header className="dashboard-header">
          <button
            className="dashboard-menu-button"
            type="button"
            aria-label="Open dashboard menu"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu aria-hidden="true" size={20} />
          </button>
          <Link className="brand-lockup" href="/?tab=feed" aria-label="Stellar DAO dashboard">
            <Image className="brand-mark" src="/icon.svg" alt="" aria-hidden="true" width={44} height={44} priority />
            <div className="brand-copy">
              <p className="brand-name">Stellar DAOs</p>
              <p className="brand-kicker">Your governance home</p>
            </div>
          </Link>
          <div className="dashboard-header__actions">
            <Link href="/create" className="nav-link dashboard-create-link">
              <Plus aria-hidden="true" size={16} strokeWidth={2} />
              Create DAO
            </Link>
            <WalletControls />
          </div>
        </header>

        <div className="dashboard-layout">
          <DashboardSidebar daos={daos} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
          <main id="main-content" className="dashboard-main" tabIndex={-1}>
            <section className="dashboard-intro" aria-labelledby="dashboard-title">
              <div>
                <p className="eyebrow">The DAO home base</p>
                <h1 className="page-title" id="dashboard-title">
                  Stay close to the communities you govern.
                </h1>
                <p className="lede">
                  Move between your activity, DAO directory, and onchain governance spaces from one place.
                </p>
              </div>
              <div className="dashboard-intro__signal" aria-label="Directory summary">
                <span className="label">Directory status</span>
                <strong>{loadError ? 'Sync paused' : daos.length ? 'Live directory' : 'Waiting for DAOs'}</strong>
                <span>
                  {loadError
                    ? 'Database unavailable'
                    : `${daos.length} operational ${daos.length === 1 ? 'DAO' : 'DAOs'}`}
                </span>
              </div>
            </section>

            {loadError ? (
              <Callout
                variant="error"
                title="DAO discovery is temporarily unavailable"
                description="The directory could not reach its indexed data. Try again later or open a DAO directly if you have its URL."
              />
            ) : null}

            <DashboardTabs>
              {(tab) => {
                if (tab === 'discover') {
                  return (
                    <div className="dashboard-discover-content">
                      <DaoDirectory daos={daos} />
                    </div>
                  );
                }
                if (tab === 'marketplace') {
                  return <MarketplaceComingSoon />;
                }
                return <EmptyDashboardTab tab={tab as Exclude<DashboardTab, 'discover' | 'marketplace'>} />;
              }}
            </DashboardTabs>
          </main>
        </div>
        <footer className="app-footer dashboard-footer">
          <span>Built for transparent, community-owned coordination.</span>
          <span>Stellar network directory</span>
        </footer>
      </div>
    </div>
  );
}
