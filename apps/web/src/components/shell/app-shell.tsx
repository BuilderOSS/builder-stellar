'use client';

import { Compass, House, Plus, Store, UserRound } from 'lucide-react';
import NextLink from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactNode, useState } from 'react';
import { css } from 'styled-system/css';

import { activeNavKey } from '@/lib/dao-nav';

import { BrandLockup } from './brand-mark';
import { NavRail, type ShellNavItem, TabBar } from './nav';
import { ShellFrame } from './shell-frame';
import { WalletButton } from './wallet-button';
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

  return (
    <ShellFrame
      rail={
        <NavRail
          label="Builder"
          items={GLOBAL_NAV}
          activeKey={active}
          action={{ label: 'Start a DAO', href: '/create', icon: Plus }}
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
