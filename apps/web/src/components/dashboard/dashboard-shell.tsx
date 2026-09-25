'use client';

import { Menu } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';

import { DaoDirectory } from '@/components/dao-directory';
import { MarketplaceComingSoon } from '@/components/marketplace/marketplace-coming-soon';
import { Callout } from '@/components/ui';
import { WalletControls } from '@/components/wallet-controls';
import type { DaoConfig } from '@/lib/dao-db';
import { useDashboardData } from '@/lib/goldsky-queries';
import { useDaoSessionStore } from '@/stores/dao-session-store';

import { DashboardFeed } from './dashboard-feed';
import { DashboardSidebar } from './dashboard-sidebar';
import { DashboardTabs } from './dashboard-tabs';
import { DashboardWelcome } from './dashboard-welcome';

export function DashboardShell({ daos, loadError }: { daos: DaoConfig[]; loadError: boolean }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const sessionAddress = useDaoSessionStore((state) => state.address);
  const isNewcomer = !sessionAddress;
  const { data: dashboardData, error: dashboardError, isLoading: dashboardLoading } = useDashboardData(sessionAddress);

  return (
    <div className="page-shell dashboard-page-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <div className="app-frame dashboard-frame">
        <header className="dashboard-header">
          {!isNewcomer ? (
            <button
              className="dashboard-menu-button"
              type="button"
              aria-label="Open dashboard menu"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu aria-hidden="true" size={20} />
            </button>
          ) : null}
          <Link className="brand-lockup" href="/" aria-label="Stellar DAO dashboard">
            <Image className="brand-mark" src="/icon.svg" alt="" aria-hidden="true" width={44} height={44} priority />
            <div className="brand-copy">
              <p className="brand-name">Stellar DAOs</p>
              <p className="brand-kicker">Your governance home</p>
            </div>
          </Link>
          <div className="dashboard-header__actions">
            <WalletControls />
          </div>
        </header>

        {isNewcomer ? (
          <main id="main-content" className="dashboard-main dashboard-guest-main" tabIndex={-1}>
            {loadError ? (
              <Callout
                variant="error"
                title="DAO discovery is temporarily unavailable"
                description="The directory could not reach its indexed data. Try again later or open a DAO directly if you have its URL."
              />
            ) : null}
            <DashboardWelcome daos={daos} />
          </main>
        ) : (
          <div className="dashboard-layout">
            <DashboardSidebar
              myDaos={dashboardData?.myDaos ?? []}
              myDaosLoading={dashboardLoading}
              myDaosError={Boolean(dashboardError)}
              isOpen={sidebarOpen}
              onClose={() => setSidebarOpen(false)}
            />
            <main id="main-content" className="dashboard-main" tabIndex={-1}>
              <section className="dashboard-intro dashboard-connected-hero" aria-labelledby="dashboard-title">
                <div>
                  <p className="eyebrow">The DAO home base</p>
                  <h1 className="page-title" id="dashboard-title">
                    Stay close to the communities you govern.
                  </h1>
                  <p className="lede">
                    Move between your activity, DAO directory, and onchain governance spaces from one place.
                  </p>
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
                  if (tab === 'feed') {
                    return (
                      <DashboardFeed
                        items={dashboardData?.feed.items ?? []}
                        isLoading={dashboardLoading}
                        error={dashboardError ? 'Your dashboard activity is temporarily unavailable.' : undefined}
                      />
                    );
                  }
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
                  return <MarketplaceComingSoon />;
                }}
              </DashboardTabs>
            </main>
          </div>
        )}
        <footer className="app-footer dashboard-footer">
          <span>Built for transparent, community-owned coordination.</span>
          <span>Stellar network directory</span>
        </footer>
      </div>
    </div>
  );
}
