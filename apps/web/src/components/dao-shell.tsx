'use client';

import { defaultModules } from '@creit.tech/stellar-wallets-kit/modules/utils';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { KitEventType } from '@creit.tech/stellar-wallets-kit/types';
import type { LucideIcon } from 'lucide-react';
import {
  ChevronDown,
  Compass,
  Gavel,
  Landmark,
  LayoutDashboard,
  LogOut,
  MoreHorizontal,
  Settings,
  ShieldAlert,
  Users,
  Vote,
  Wallet
} from 'lucide-react';
import type { Route } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';

import { Button, Callout } from '@/components/ui';
import { useDaoContext } from '@/contexts/dao-context';
import type { DaoNetworkConfig } from '@/lib/dao-config';
import { useGoldskyMember } from '@/lib/goldsky-queries';
import { useDaoSessionStore } from '@/stores/dao-session-store';

function getNavItems(daoId: string): Array<{ href: Route; label: string; icon: LucideIcon }> {
  return [
    { href: '/', label: 'Explore', icon: Compass },
    { href: `/dao/${daoId}` as Route, label: 'Dashboard', icon: LayoutDashboard },
    { href: `/dao/${daoId}/proposals` as Route, label: 'Proposals', icon: Vote },
    { href: `/dao/${daoId}/auctions` as Route, label: 'Auctions', icon: Gavel },
    { href: `/dao/${daoId}/treasury` as Route, label: 'Treasury', icon: Landmark },
    { href: `/dao/${daoId}/members` as Route, label: 'Members', icon: Users }
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

function isRouteActive(pathname: string, href: Route) {
  return pathname === href || (href !== '/' && pathname.startsWith(`${href}/`));
}

function shortenAddress(value: string) {
  if (value.length <= 12) return value;
  return `${value.slice(0, 5)}…${value.slice(-4)}`;
}

function hasDaoMembership(member: ReturnType<typeof useGoldskyMember>['data']) {
  if (!member?.item) return false;

  try {
    return BigInt(member.item.voting_power) > 0n || BigInt(member.item.owned_token_count) > 0n;
  } catch {
    return false;
  }
}

async function validateWalletNetwork(
  address: string,
  currentNetwork: DaoNetworkConfig,
  updateSession: ReturnType<typeof useDaoSessionStore.getState>['updateSession']
) {
  try {
    const walletNetwork = await StellarWalletsKit.getNetwork();
    const matchesConfiguredNetwork = walletNetwork.networkPassphrase === currentNetwork.passphrase;
    const status = matchesConfiguredNetwork
      ? `Connected on ${currentNetwork.label}`
      : `Wallet network mismatch: ${walletNetwork.network ?? 'unknown'} is not ${currentNetwork.label}`;

    updateSession({
      address,
      status,
      walletNetworkPassphrase: walletNetwork.networkPassphrase,
      walletNetworkIssue: matchesConfiguredNetwork
        ? ''
        : `Wallet is on ${walletNetwork.network ?? 'an unknown network'} and must be switched to ${currentNetwork.label}.`
    });
  } catch (error) {
    updateSession({
      address,
      status: 'Wallet network validation unavailable',
      walletNetworkPassphrase: '',
      walletNetworkIssue:
        error instanceof Error ? error.message : 'This wallet cannot report its network, so the app cannot validate it.'
    });
  }
}

export function DaoShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { daoId, daoConfig: currentNetwork } = useDaoContext();
  const session = useDaoSessionStore();
  const updateSession = useDaoSessionStore((state) => state.updateSession);
  const { data: memberLookup } = useGoldskyMember(currentNetwork.tokenContractId, session.address);
  const walletDisabled = Boolean(session.address && session.walletNetworkIssue);

  const baseNavItems = getNavItems(daoId);
  const adminNavItem: { href: Route; label: string; icon: LucideIcon } = {
    href: `/dao/${daoId}/admin` as Route,
    label: 'Admin',
    icon: Settings
  };
  const navItems = hasDaoMembership(memberLookup) ? [...baseNavItems, adminNavItem] : baseNavItems;
  const desktopPrimaryNavItems = navItems.slice(0, 2);
  const desktopSecondaryNavItems = navItems.slice(2);
  const mobilePrimaryNavItems = navItems.slice(0, 3);
  const mobileOverflowNavItems = navItems.slice(3);

  useEffect(() => {
    StellarWalletsKit.init({ modules: defaultModules() });

    const onStateUpdated = StellarWalletsKit.on(KitEventType.STATE_UPDATED, (event) => {
      const nextAddress = event.payload.address ?? '';
      updateSession({ address: nextAddress });
    });

    const onDisconnect = StellarWalletsKit.on(KitEventType.DISCONNECT, () => {
      updateSession({
        address: '',
        status: 'Disconnected',
        syncedAt: '',
        walletNetworkPassphrase: '',
        walletNetworkIssue: ''
      });
    });

    return () => {
      onStateUpdated();
      onDisconnect();
    };
  }, [currentNetwork.label, updateSession]);

  useEffect(() => {
    if (!session.address) {
      return;
    }

    void validateWalletNetwork(session.address, currentNetwork, updateSession);
  }, [currentNetwork, session.address, updateSession]);

  async function connectWallet() {
    try {
      const result = await StellarWalletsKit.authModal();
      await validateWalletNetwork(result.address, currentNetwork, updateSession);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Wallet connection failed';
      updateSession({ status: message });
    }
  }

  async function disconnectWallet() {
    try {
      await StellarWalletsKit.disconnect();
    } finally {
      updateSession({
        address: '',
        status: 'Disconnected',
        syncedAt: '',
        walletNetworkPassphrase: '',
        walletNetworkIssue: ''
      });
    }
  }

  return (
    <div className="page-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <div className="app-frame">
        <header className="app-header">
          <Link className="brand-lockup" href={`/dao/${daoId}`} aria-label={`${currentNetwork.tokenName} dashboard`}>
            <Image className="brand-mark" src="/icon.svg" alt="" aria-hidden="true" width={44} height={44} priority />
            <div className="brand-copy">
              <p className="brand-name">{currentNetwork.tokenName}</p>
              <p className="brand-kicker">Stellar governance</p>
            </div>
          </Link>

          <div className="nav-groups">
            <nav className="primary-nav" aria-label="Primary navigation">
              {desktopPrimaryNavItems.map((item) => (
                <NavLink key={item.href} {...item} active={isRouteActive(pathname, item.href)} />
              ))}
            </nav>
            <nav className="secondary-nav" aria-label="DAO sections">
              {desktopSecondaryNavItems.map((item) => (
                <NavLink key={item.href} {...item} active={isRouteActive(pathname, item.href)} />
              ))}
            </nav>
          </div>

          <div className="header-actions">
            <div className="network-chip" title={`Configured for ${currentNetwork.label}`}>
              <span className="network-dot" aria-hidden="true" />
              {currentNetwork.label}
            </div>
            <div className="wallet-summary">
              {session.address ? (
                <details className="wallet-menu">
                  <summary
                    className="wallet-menu__trigger"
                    title={session.address}
                    aria-label={`Wallet menu for ${session.address}`}
                  >
                    <Wallet aria-hidden="true" size={16} />
                    {shortenAddress(session.address)}
                    <ChevronDown aria-hidden="true" size={14} />
                  </summary>
                  <button className="wallet-menu__disconnect" type="button" onClick={disconnectWallet}>
                    <LogOut aria-hidden="true" size={15} />
                    Disconnect
                  </button>
                </details>
              ) : (
                <Button type="button" variant="solid" size="sm" onClick={connectWallet} aria-label="Connect wallet">
                  <Wallet aria-hidden="true" size={16} />
                  Connect
                </Button>
              )}
            </div>
          </div>
        </header>

        <nav className="mobile-nav" aria-label="Mobile navigation">
          {mobilePrimaryNavItems.map((item) => (
            <NavLink key={item.href} {...item} active={isRouteActive(pathname, item.href)} />
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
                <p className="label">More sections</p>
                {mobileOverflowNavItems.map((item) => (
                  <NavLink key={item.href} {...item} active={isRouteActive(pathname, item.href)} />
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
