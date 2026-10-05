'use client';

import type { LucideIcon } from 'lucide-react';
import {
  Gavel,
  Landmark,
  LayoutDashboard,
  LogOut,
  MoreHorizontal,
  Settings,
  ShieldAlert,
  Store,
  Users,
  Vote
} from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactNode } from 'react';

import { DaoImage } from '@/components/dao-image';
import { DashboardFooter } from '@/components/dashboard/dashboard-footer';
import { NetworkIndicator } from '@/components/network-indicator';
import { ProposalDraftIndicator } from '@/components/proposal/proposal-draft-indicator';
import { Callout } from '@/components/ui';
import { WalletControls } from '@/components/wallet-controls';
import { useDaoContext } from '@/contexts/dao-context';
import { useGoldskyMember } from '@/lib/goldsky-queries';
import { useAuthSessionStore } from '@/stores/auth-session-store';

type NavItem = { href: Route; label: string; icon: LucideIcon; exact?: boolean };

function getNavItems(daoId: string, _auctionEnabled?: boolean | null): NavItem[] {
  const items: NavItem[] = [
    { href: `/dao/${daoId}` as Route, label: 'Overview', icon: LayoutDashboard, exact: true },
    { href: `/dao/${daoId}/proposals` as Route, label: 'Governance', icon: Vote },
    { href: `/dao/${daoId}/treasury` as Route, label: 'Treasury', icon: Landmark },
    { href: `/dao/${daoId}/auctions` as Route, label: 'Auctions', icon: Gavel },
    { href: `/dao/${daoId}/members` as Route, label: 'Members', icon: Users },
    { href: `/dao/${daoId}/marketplace` as Route, label: 'Marketplace', icon: Store }
  ];

  // Auctions are always visible for operational DAOs. Users can view the status
  // and enable/disable from the admin page. Disabled auctions can be reactivated.

  return items;
}

function NavLink({
  href,
  label,
  icon: Icon,
  active,
  className = ''
}: {
  href: Route;
  label: string;
  icon: LucideIcon;
  active: boolean;
  className?: string;
}) {
  return (
    <Link href={href} className={`nav-link ${className}`} aria-current={active ? 'page' : undefined}>
      <Icon aria-hidden="true" size={16} strokeWidth={2} />
      {label}
    </Link>
  );
}

function isRouteActive(pathname: string, href: Route, exact = false) {
  return pathname === href || (!exact && href !== '/' && pathname.startsWith(`${href}/`));
}

function hasDaoMembership(member: ReturnType<typeof useGoldskyMember>['data']) {
  if (!member?.item) return false;

  try {
    return BigInt(member.item.voting_power) > 0n || BigInt(member.item.owned_token_count) > 0n;
  } catch {
    return false;
  }
}

export function DaoShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { daoId, daoConfig: currentNetwork } = useDaoContext();
  const session = useAuthSessionStore();
  const { data: memberLookup } = useGoldskyMember(currentNetwork.tokenContractId, session.address);
  const walletDisabled = Boolean(session.address && session.walletNetworkIssue);

  const baseNavItems = getNavItems(daoId, currentNetwork.auctionEnabled);
  const adminNavItem: NavItem = {
    href: `/dao/${daoId}/admin` as Route,
    label: 'Manage',
    icon: Settings
  };
  const navItems = hasDaoMembership(memberLookup) ? [...baseNavItems, adminNavItem] : baseNavItems;
  const [overview, governance, treasury, auctions, members, marketplace] = navItems;
  const manage = navItems.at(-1)?.label === 'Manage' ? navItems.at(-1) : undefined;
  const marketIsActive = isRouteActive(pathname, auctions.href) || isRouteActive(pathname, marketplace.href);

  return (
    <div className="page-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <div className="app-frame dao-workspace-frame">
        <aside className="dao-workspace-sidebar" aria-label={`${currentNetwork.tokenName} workspace navigation`}>
          <Link className="dao-workspace-sidebar__identity" href={`/dao/${daoId}`}>
            <DaoImage
              className="brand-mark"
              src={currentNetwork.contractImage}
              alt={`${currentNetwork.tokenName} logo`}
              width={44}
              height={44}
            />
            <span className="brand-copy">
              <span className="brand-name">{currentNetwork.tokenName}</span>
              <span className="brand-kicker">DAO workspace</span>
            </span>
          </Link>
          <Link className="dao-workspace-sidebar__exit" href="/">
            <LogOut aria-hidden="true" size={16} />
            Exit to Builder
          </Link>
          <nav className="dao-workspace-nav" aria-label="DAO sections">
            <NavLink
              {...overview}
              active={isRouteActive(pathname, overview.href, overview.exact)}
              className="dao-workspace-nav__link"
            />
            <NavLink {...governance} active={isRouteActive(pathname, governance.href)} className="dao-workspace-nav__link" />
            <NavLink {...treasury} active={isRouteActive(pathname, treasury.href)} className="dao-workspace-nav__link" />
            <NavLink {...members} active={isRouteActive(pathname, members.href)} className="dao-workspace-nav__link" />
            <div className="dao-workspace-nav__group" role="group" aria-labelledby="market-nav-heading">
              <span id="market-nav-heading" className="dao-workspace-nav__group-label">
                Market
              </span>
              <NavLink
                {...auctions}
                active={isRouteActive(pathname, auctions.href)}
                className="dao-workspace-nav__link dao-workspace-nav__link--nested"
              />
              <NavLink
                {...marketplace}
                active={isRouteActive(pathname, marketplace.href)}
                className="dao-workspace-nav__link dao-workspace-nav__link--nested"
              />
            </div>
            {manage ? (
              <NavLink {...manage} active={isRouteActive(pathname, manage.href)} className="dao-workspace-nav__link" />
            ) : null}
          </nav>
        </aside>

        <div className="dao-workspace-main">
          <header className="app-header dao-workspace-header">
            <div className="dao-header__identity dao-workspace-header__identity">
              <Link className="dao-exit-button" href="/" aria-label="Exit DAO and return to Builder">
                <LogOut className="dao-exit-button__icon" aria-hidden="true" size={17} />
                <span className="dao-exit-button__text">Exit to Builder</span>
              </Link>
              <Link
                className="brand-lockup"
                href={`/dao/${daoId}`}
                aria-label={`${currentNetwork.tokenName} overview`}
              >
                <DaoImage
                  className="brand-mark"
                  src={currentNetwork.contractImage}
                  alt={`${currentNetwork.tokenName} logo`}
                  width={44}
                  height={44}
                />
                <div className="brand-copy">
                  <p className="brand-name">{currentNetwork.tokenName}</p>
                  <p className="brand-kicker">Stellar governance</p>
                </div>
              </Link>
            </div>
            <div className="header-actions">
              <NetworkIndicator isConnected={Boolean(session.address)} />
              <ProposalDraftIndicator daoId={daoId} config={currentNetwork} address={session.address} />
              <WalletControls network={currentNetwork} />
            </div>
          </header>

          <nav className="mobile-nav dao-mobile-nav" aria-label="DAO workspace navigation">
            <NavLink {...overview} active={isRouteActive(pathname, overview.href, overview.exact)} />
            <NavLink {...governance} active={isRouteActive(pathname, governance.href)} />
            <details className={`dao-mobile-nav__menu${marketIsActive ? ' dao-mobile-nav__menu--active' : ''}`}>
              <summary className="dao-mobile-nav__trigger">
                <Store aria-hidden="true" size={16} strokeWidth={2} />
                <span>Market</span>
              </summary>
              <div className="dao-mobile-nav__panel">
                <NavLink {...auctions} active={isRouteActive(pathname, auctions.href)} />
                <NavLink {...marketplace} active={isRouteActive(pathname, marketplace.href)} />
              </div>
            </details>
            <NavLink {...members} active={isRouteActive(pathname, members.href)} />
            <details className={`dao-mobile-nav__menu${isRouteActive(pathname, treasury.href) || Boolean(manage && isRouteActive(pathname, manage.href)) ? ' dao-mobile-nav__menu--active' : ''}`}>
              <summary className="dao-mobile-nav__trigger">
                <MoreHorizontal aria-hidden="true" size={16} strokeWidth={2} />
                <span>More</span>
              </summary>
              <div className="dao-mobile-nav__panel">
                <NavLink {...treasury} active={isRouteActive(pathname, treasury.href)} />
                {manage ? <NavLink {...manage} active={isRouteActive(pathname, manage.href)} /> : null}
              </div>
            </details>
          </nav>

          <main id="main-content" className="content-shell" tabIndex={-1} aria-busy={walletDisabled || undefined}>
            <div
              style={{
                pointerEvents: walletDisabled ? 'none' : undefined,
                filter: walletDisabled ? 'saturate(0.6) brightness(0.5)' : undefined,
                opacity: walletDisabled ? 0.55 : 1
              }}
            >
              {children}
            </div>

            {walletDisabled ? (
              <div
                role="alert"
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'center',
                  padding: '24px 0',
                  background: 'rgba(8, 9, 11, 0.78)',
                  backdropFilter: 'blur(3px)',
                  zIndex: 20
                }}
              >
                <div style={{ maxWidth: '720px', width: '100%' }}>
                  <Callout
                    variant="error"
                    badge={
                      <>
                        <ShieldAlert aria-hidden="true" size={14} /> Network mismatch
                      </>
                    }
                    title={session.walletNetworkIssue}
                    description={`Switch the connected wallet to ${currentNetwork.label} to continue. No transaction can be submitted until the network matches.`}
                  />
                </div>
              </div>
            ) : null}
          </main>

          <DashboardFooter />
        </div>
      </div>
    </div>
  );
}
