'use client';

import { Compass, House, Plus, Store, UserRound } from 'lucide-react';
import NextLink from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactNode, useState } from 'react';
import { css } from 'styled-system/css';

import { useHomeDao } from '@/hooks/use-home-dao';
import { activeNavKey } from '@/lib/dao-nav';
import { daoRoute, daoRouteId } from '@/lib/dao-routes';
import { useDashboardData } from '@/lib/goldsky-queries';

import { BrandLockup } from './brand-mark';
import { NavRail, type RailCommunity, type ShellNavItem, TabBar } from './nav';
import { ShellFrame } from './shell-frame';
import { WalletButton } from './wallet-button';
import { useWalletSession } from './wallet-session';
import { YouSheet } from './you-sheet';

const GLOBAL_NAV: ShellNavItem[] = [
  { key: 'home', label: 'Home', href: '/', icon: House, exact: true },
  { key: 'discover', label: 'Discover', href: '/discover', icon: Compass },
  { key: 'market', label: 'Market', href: '/marketplace', icon: Store }
];

const mobileOnly = css({ display: { base: 'inline-flex', md: 'none' }, textDecoration: 'none' });
/** Builder outside a community: Home, Discover, Market and You. */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [youOpen, setYouOpen] = useState(false);
  const active = activeNavKey(pathname, GLOBAL_NAV)?.key;
  const wallet = useWalletSession();
  const { home } = useHomeDao();
  // Same request as Home's "Your communities", so it is shared rather than repeated.
  const { data } = useDashboardData(wallet.isAuthenticated ? wallet.address : '');
  const communities: RailCommunity[] = (data?.myDaos ?? [])
    .map((dao) => ({
      key: dao.dao_id,
      label: dao.token_name || dao.token_symbol || 'Unnamed community',
      href: daoRoute(daoRouteId({ daoId: dao.dao_id, slug: dao.slug })),
      seed: dao.dao_id,
      image: dao.contract_image
    }))
    .sort((a, b) => (a.key === home?.id ? -1 : b.key === home?.id ? 1 : 0));

  return (
    <ShellFrame
      rail={
        <NavRail
          label="Builder"
          items={GLOBAL_NAV}
          activeKey={active}
          action={{ label: 'Start a DAO', href: '/create', icon: Plus }}
          communities={communities}
          communitiesHref="/#your-communities"
        />
      }
      topStart={
        <NextLink href="/" className={mobileOnly} aria-label="Builder home">
          <BrandLockup />
        </NextLink>
      }
      topEnd={<WalletButton onOpenYou={() => setYouOpen(true)} />}
      tabBar={
        <TabBar
          label="Builder"
          items={GLOBAL_NAV}
          activeKey={active}
          extra={{ label: 'You', icon: UserRound, onClick: () => setYouOpen(true), active: youOpen }}
        />
      }
      overlays={<YouSheet open={youOpen} onOpenChange={setYouOpen} />}
    >
      {children}
    </ShellFrame>
  );
}

/**
 * Root-level switch: community routes render their own shell from the DAO
 * layout; everything else gets the global shell.
 */
export function GlobalShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname.startsWith('/dao/')) return <>{children}</>;
  return <AppShell>{children}</AppShell>;
}
