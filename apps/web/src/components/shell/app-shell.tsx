'use client';

import { Compass, House, Plus, Store, UserRound } from 'lucide-react';
import NextLink from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactNode, useState } from 'react';
import { css } from 'styled-system/css';

import { Tooltip } from '@/components/ui';
import { activeNavKey } from '@/lib/dao-nav';

import { BrandLockup, BrandMark } from './brand-mark';
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
const homeMark = css({
  display: 'grid',
  placeItems: 'center',
  borderRadius: '10px',
  _focusVisible: { outline: '2px solid', outlineColor: 'signal', outlineOffset: '2px' }
});
const createButton = css({
  display: 'grid',
  placeItems: 'center',
  width: '12',
  height: '12',
  borderRadius: '14px',
  bg: 'primary',
  color: 'primary.fg',
  transitionProperty: 'background-color, scale',
  transitionDuration: 'press',
  transitionTimingFunction: 'out',
  _active: { scale: '0.96' },
  '@media (hover: hover) and (pointer: fine)': { _hover: { bg: 'primary.hover' } },
  _focusVisible: { outline: '2px solid', outlineColor: 'signal', outlineOffset: '2px' },
  '& svg': { width: '5.5', height: '5.5' }
});

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
          top={
            <Tooltip content="Builder home" placement="right" id="rail-builder-home">
              <NextLink href="/" className={homeMark} aria-label="Builder home">
                <BrandMark size={36} />
              </NextLink>
            </Tooltip>
          }
          items={GLOBAL_NAV}
          activeKey={active}
          footer={
            <Tooltip content="Start a DAO" placement="right" id="rail-start-dao">
              <NextLink href="/create" className={createButton} aria-label="Start a DAO">
                <Plus aria-hidden="true" strokeWidth={2.25} />
              </NextLink>
            </Tooltip>
          }
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
