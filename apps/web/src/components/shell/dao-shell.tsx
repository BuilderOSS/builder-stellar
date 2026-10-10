'use client';

import type { LucideIcon } from 'lucide-react';
import { Gavel, House, Landmark, MoreHorizontal, Settings, Store, Ticket, Users, Vote } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { css } from 'styled-system/css';

import { DaoContractList } from '@/components/dao-contract-list';
import { Disclosure, ListRow, Sheet } from '@/components/ui';
import { useDaoContext } from '@/contexts/dao-context';
import { useCloseOnNavigate } from '@/hooks/use-close-on-navigate';
import { useDaoMembership } from '@/hooks/use-dao-membership';
import { activeNavKey, type DaoNavItem, type DaoNavKey, resolveDaoNav } from '@/lib/dao-nav';
import { canonicalDaoUrl } from '@/lib/dao-routes';
import { selectHasDraft, useProposalComposerStore } from '@/stores/proposal-composer-store';

import { DaoSwitcher } from './dao-switcher';
import { NavRail, type ShellNavItem, TabBar } from './nav';
import { ShellFrame } from './shell-frame';
import { WalletButton } from './wallet-button';
import { YouSheet } from './you-sheet';

const ICONS: Record<DaoNavKey, LucideIcon> = {
  home: House,
  vote: Vote,
  auction: Gavel,
  market: Store,
  treasury: Landmark,
  members: Users,
  claims: Ticket,
  manage: Settings
};

const MORE_META: Partial<Record<DaoNavKey, string>> = {
  auction: 'Bid on new tokens',
  market: 'Buy and sell tokens',
  members: 'Who holds tokens and votes',
  claims: 'Claim tokens you are allowed to mint',
  manage: 'Settings, roles and setup'
};

const moreList = css({ display: 'grid', listStyle: 'none', m: '0', p: '0' });
const moreIcon = css({
  display: 'grid',
  placeItems: 'center',
  width: '10',
  height: '10',
  borderRadius: 'control',
  bg: 'hover',
  color: 'ink.muted',
  '& svg': { width: '5', height: '5' }
});

function toShellItem(item: DaoNavItem, badge?: boolean): ShellNavItem {
  return { ...item, icon: ICONS[item.key], badge };
}

/** Builder inside a community: Home, Vote, slot 3, Treasury, More. */
export function DaoShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { daoId, routeId, daoConfig } = useDaoContext();
  const membership = useDaoMembership(daoConfig);
  const hasDraft = useProposalComposerStore(selectHasDraft(membership.address || null, daoId));
  const [youOpen, setYouOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  useCloseOnNavigate(() => setMoreOpen(false));

  // Links always use the canonical id (claimed slug, else address). If the community was opened by
  // another id, swap the address bar in place: no navigation, refetch, scroll jump or extra history entry.
  useEffect(() => {
    const next = canonicalDaoUrl(window.location, routeId);
    if (next) window.history.replaceState(null, '', next);
  }, [pathname, routeId]);
  // Match tabs against the canonical path, so the active tab is right even before the swap lands.
  const canonicalPath = canonicalDaoUrl({ pathname }, routeId) ?? pathname;
  const nav = useMemo(
    () => resolveDaoNav(routeId, daoConfig, { canManage: membership.canManage }),
    [daoConfig, routeId, membership.canManage]
  );
  const decorate = (item: DaoNavItem) => toShellItem(item, item.key === 'vote' && hasDraft);
  const tabs = nav.tabs.map(decorate);
  const rail = nav.rail.map(decorate);
  const railFooter = nav.railFooter.map(decorate);
  const allItems = [...rail, ...railFooter];
  const active = activeNavKey(canonicalPath, allItems)?.key;
  const moreActive = nav.more.some((item) => item.key === active);
  const name = daoConfig.tokenName || 'Community';

  return (
    <ShellFrame
      rail={<NavRail label={`${name} sections`} items={rail} footerItems={railFooter} activeKey={active} />}
      topStart={
        <DaoSwitcher current={{ id: daoId, name, image: daoConfig.contractImage, seed: daoConfig.tokenContractId }} />
      }
      topEnd={<WalletButton onOpenYou={() => setYouOpen(true)} />}
      tabBar={
        <TabBar
          label={`${name} sections`}
          items={tabs}
          activeKey={active}
          extra={{ label: 'More', icon: MoreHorizontal, onClick: () => setMoreOpen(true), active: moreActive }}
        />
      }
      overlays={
        <>
          <YouSheet open={youOpen} onOpenChange={setYouOpen} />
          <Sheet open={moreOpen} onOpenChange={setMoreOpen} title={name} description="More in this community">
            <ul className={moreList}>
              {nav.more.map((item) => {
                const Icon = ICONS[item.key];
                return (
                  <ListRow
                    key={item.key}
                    as="li"
                    href={item.href}
                    media={
                      <span className={moreIcon}>
                        <Icon aria-hidden="true" />
                      </span>
                    }
                    title={item.label}
                    meta={MORE_META[item.key]}
                  />
                );
              })}
            </ul>
            <div className={css({ mt: '4' })}>
              <Disclosure title="Contracts">
                <DaoContractList config={daoConfig} compact />
              </Disclosure>
            </div>
          </Sheet>
        </>
      }
    >
      {children}
    </ShellFrame>
  );
}
