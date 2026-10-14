'use client';

import { Compass, House, Plus, Store, UserRound } from 'lucide-react';
import NextLink from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactNode, useState } from 'react';
import { css } from 'styled-system/css';

import { activeNavKey } from '@/lib/dao-nav';
import { daoRoute, daoRouteId } from '@/lib/dao-routes';
import { useDashboardData } from '@/lib/goldsky-queries';
import { SITE_NAME } from '@/lib/site';

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
/** Tribe Builder outside a tribe: Home, Discover, Market and You. */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [youOpen, setYouOpen] = useState(false);
  const active = activeNavKey(pathname, GLOBAL_NAV)?.key;
  const wallet = useWalletSession();
  // Same request as Home's "Your tribes", so it is shared rather than repeated.
  const { data } = useDashboardData(wallet.isAuthenticated ? wallet.address : '');
  const communities: RailCommunity[] = (data?.myDaos ?? []).map((dao) => ({
    key: dao.dao_id,
    label: dao.token_name || dao.token_symbol || 'Unnamed tribe',
    href: daoRoute(daoRouteId({ daoId: dao.dao_id, slug: dao.slug })),
    seed: dao.dao_id,
    image: dao.image
  }));

  return (
    <ShellFrame
      rail={
        <NavRail
          label={SITE_NAME}
          items={GLOBAL_NAV}
          activeKey={active}
          action={{ label: 'Build a tribe', href: '/create', icon: Plus }}
          communities={communities}
          communitiesHref="/#your-tribes"
        />
      }
      topStart={
        <NextLink href="/" className={mobileOnly} aria-label={`${SITE_NAME} home`}>
          <BrandLockup />
        </NextLink>
      }
      topEnd={<WalletButton onOpenYou={() => setYouOpen(true)} />}
      tabBar={
        <TabBar
          label={SITE_NAME}
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
