'use client';

import Link from 'next/link';

import { DaoDirectory } from '@/components/dao-directory';
import { MarketplaceComingSoon } from '@/components/marketplace/marketplace-coming-soon';
import { Callout } from '@/components/ui';
import type { DaoConfig } from '@/lib/dao-db';
import { useDashboardData } from '@/lib/goldsky-queries';
import { useAuthSessionStore } from '@/stores/auth-session-store';

import { DashboardFeed } from './dashboard-feed';
import { DashboardDaoWorlds } from './dashboard-dao-worlds';
import { DashboardFooter } from './dashboard-footer';
import { DashboardHeader } from './dashboard-header';

export function DashboardShell({
  daos,
  pendingDaos,
  loadError
}: {
  daos: DaoConfig[];
  pendingDaos: DaoConfig[];
  loadError: boolean;
}) {
  const sessionAddress = useAuthSessionStore((state) => state.address);
  const isConnected = Boolean(sessionAddress);
  const { data: dashboardData, error: dashboardError, isLoading: dashboardLoading } = useDashboardData(sessionAddress);

  // Don't use nav rail on dashboard (only on DAO pages)
  // Global nav rail is added by DaoShell for DAO pages

  return (
    <div className="page-shell dashboard-page-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      {/* Nav rail is only used on DAO pages, not on dashboard */}
      <div className="app-frame dashboard-frame">
        <DashboardHeader />

        <main id="main-content" className="dashboard-main dashboard-lobby" tabIndex={-1}>
          <section className="dashboard-lobby__hero" aria-labelledby="dashboard-title">
            <div>
              <p className="eyebrow">Builder Lobby</p>
              <h1 className="page-title" id="dashboard-title">
                {isConnected ? 'Your gateway to DAO worlds.' : 'Discover and enter independent DAO worlds.'}
              </h1>
              <p className="lede">
                Builder helps communities launch, discover, and enter their own institutions on Stellar. Each DAO runs
                its own governance, treasury, and market.
              </p>
            </div>
            <div className="dashboard-lobby__hero-actions">
              <a className="dashboard-lobby__primary-action" href="#discover-daos">
                Discover DAOs
              </a>
              <Link className="dashboard-lobby__secondary-action" href="/create">
                Create a DAO
              </Link>
            </div>
          </section>

          {loadError ? (
            <Callout
              variant="error"
              title="DAO discovery is temporarily unavailable"
              description="The directory could not reach its indexed data. Try again later or open a DAO directly if you have its URL."
            />
          ) : null}

          {isConnected ? (
            <div className="dashboard-lobby__member-grid">
              <section
                className="dashboard-lobby__section dashboard-lobby__worlds"
                aria-labelledby="my-dao-worlds-title"
              >
                <div className="dashboard-lobby__section-heading">
                  <div>
                    <p className="eyebrow">Your communities</p>
                    <h2 id="my-dao-worlds-title">My DAO worlds</h2>
                  </div>
                </div>
                <DashboardDaoWorlds
                  myDaos={dashboardData?.myDaos ?? []}
                  isLoading={dashboardLoading}
                  hasError={Boolean(dashboardError)}
                />
              </section>
              <DashboardFeed
                items={dashboardData?.feed.items ?? []}
                isLoading={dashboardLoading}
                error={dashboardError ? 'Your recent DAO activity is temporarily unavailable.' : undefined}
              />
            </div>
          ) : null}

          {isConnected && pendingDaos.length ? (
            <section
              className="dashboard-lobby__section dashboard-lobby__launch-queue"
              aria-labelledby="launch-queue-title"
            >
              <div className="dashboard-lobby__section-heading">
                <div>
                  <p className="eyebrow">Launch admin only</p>
                  <h2 id="launch-queue-title">Launch queue</h2>
                  <p className="lede">Resume the DAO setup work assigned to this connected wallet.</p>
                </div>
              </div>
              <DaoDirectory
                daos={pendingDaos}
                eyebrow="Resumable setup"
                heading="DAOs waiting for launch"
                hint="Only you can see these DAOs because this wallet is their launch administrator."
              />
            </section>
          ) : null}

          <section id="discover-daos" className="dashboard-lobby__section" aria-label="Discover DAOs">
            <DaoDirectory
              daos={daos}
              eyebrow="Builder Lobby"
              heading="Discover DAOs"
              hint="Enter a DAO to use its own governance, treasury, and member workspace."
            />
          </section>

          <section className="dashboard-lobby__section" aria-labelledby="marketplace-title">
            <div className="dashboard-lobby__section-heading">
              <div>
                <p className="eyebrow">Platform-wide browsing</p>
                <h2 id="marketplace-title">Marketplace</h2>
              </div>
            </div>
            <MarketplaceComingSoon />
          </section>
        </main>
        <DashboardFooter />
      </div>
    </div>
  );
}
