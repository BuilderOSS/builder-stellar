'use client';

import type { LucideIcon } from 'lucide-react';
import {
  ArrowLeft,
  Gavel,
  Landmark,
  LayoutDashboard,
  MoreHorizontal,
  Settings,
  ShieldAlert,
  Store,
  Users,
  Vote
} from 'lucide-react';
import type { Route } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactNode } from 'react';

import { Callout } from '@/components/ui';
import { WalletControls } from '@/components/wallet-controls';
import { useDaoContext } from '@/contexts/dao-context';
import { useGoldskyMember } from '@/lib/goldsky-queries';
import { useDaoSessionStore } from '@/stores/dao-session-store';

type NavItem = { href: Route; label: string; icon: LucideIcon; exact?: boolean };

function getNavItems(daoId: string): NavItem[] {
  return [
    { href: `/dao/${daoId}` as Route, label: 'Dashboard', icon: LayoutDashboard, exact: true },
    { href: `/dao/${daoId}/proposals` as Route, label: 'Proposals', icon: Vote },
    { href: `/dao/${daoId}/auctions` as Route, label: 'Auctions', icon: Gavel },
    { href: `/dao/${daoId}/treasury` as Route, label: 'Treasury', icon: Landmark },
    { href: `/dao/${daoId}/members` as Route, label: 'Members', icon: Users },
    { href: `/dao/${daoId}/marketplace` as Route, label: 'Marketplace', icon: Store }
  ];
}

function NavLink({
  href,
  label,
  icon: Icon,
  active
}: {
  href: Route;
  label: string;
  icon: LucideIcon;
  active: boolean;
}) {
  return (
    <Link href={href} className="nav-link" aria-current={active ? 'page' : undefined}>
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
  const session = useDaoSessionStore();
  const { data: memberLookup } = useGoldskyMember(currentNetwork.tokenContractId, session.address);
  const walletDisabled = Boolean(session.address && session.walletNetworkIssue);

  const baseNavItems = getNavItems(daoId);
  const adminNavItem: NavItem = {
    href: `/dao/${daoId}/admin` as Route,
    label: 'Admin',
    icon: Settings
  };
  const navItems = hasDaoMembership(memberLookup) ? [...baseNavItems, adminNavItem] : baseNavItems;
  const desktopNavItems = navItems;
  const mobilePrimaryNavItems = navItems.slice(0, 3);
  const mobileOverflowNavItems = navItems.slice(3);

  return (
    <div className="page-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <div className="app-frame">
        <header className="app-header">
          <div className="dao-header__identity">
            <Link className="dao-exit-button" href="/" aria-label="Exit DAO and return to Dashboard">
              <ArrowLeft className="dao-exit-button__icon" aria-hidden="true" size={17} />
              <span className="dao-exit-button__text">Exit DAO</span>
            </Link>
            <Link className="brand-lockup" href={`/dao/${daoId}`} aria-label={`${currentNetwork.tokenName} dashboard`}>
              <Image className="brand-mark" src="/icon.svg" alt="" aria-hidden="true" width={44} height={44} priority />
              <div className="brand-copy">
                <p className="brand-name">{currentNetwork.tokenName}</p>
                <p className="brand-kicker">Stellar governance</p>
              </div>
            </Link>
          </div>

          <div className="nav-groups">
            <nav className="secondary-nav" aria-label="DAO sections">
              {desktopNavItems.map((item) => (
                <NavLink key={item.href} {...item} active={isRouteActive(pathname, item.href, item.exact)} />
              ))}
            </nav>
          </div>

          <div className="header-actions">
            {/*
            <div className="network-chip" title={`Configured for ${currentNetwork.label}`}>
              <span className="network-dot" aria-hidden="true" />
              {currentNetwork.label}
            </div>
*/}
            <WalletControls network={currentNetwork} />
          </div>
        </header>

        <nav className="mobile-nav" aria-label="Mobile navigation">
          {mobilePrimaryNavItems.map((item) => (
            <NavLink key={item.href} {...item} active={isRouteActive(pathname, item.href, item.exact)} />
          ))}
          {mobileOverflowNavItems.length ? (
            <details className="dashboard-menu mobile-nav__more">
              <summary
                className="dashboard-menu__trigger dashboard-menu__trigger--icon"
                aria-label="More DAO navigation"
                title="More DAO navigation"
              >
                <MoreHorizontal aria-hidden="true" size={18} />
              </summary>
              <div className="dashboard-menu__panel dashboard-options-menu">
                {mobileOverflowNavItems.map((item) => (
                  <NavLink key={item.href} {...item} active={isRouteActive(pathname, item.href, item.exact)} />
                ))}
              </div>
            </details>
          ) : null}
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

        <footer className="app-footer">
          <span>{currentNetwork.tokenDescription}</span>
          <span title={currentNetwork.rpcUrl}>Network status: {session.status || 'Ready'}</span>
        </footer>
      </div>
    </div>
  );
}
