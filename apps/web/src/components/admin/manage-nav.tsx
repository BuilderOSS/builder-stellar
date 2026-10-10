'use client';

import { ChevronDown } from 'lucide-react';
import type { Route } from 'next';
import NextLink from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { css, sva } from 'styled-system/css';

import { Button, ListRow, Sheet } from '@/components/ui';
import { useCloseOnNavigate } from '@/hooks/use-close-on-navigate';
import { activeNavKey } from '@/lib/dao-nav';
import { daoAdminRoute, daoRoute } from '@/lib/dao-routes';

type ManageItem = {
  key: string;
  label: string;
  meta: string;
  section: string;
  exact?: boolean;
  /** Needed before launch; tagged while the community is in setup. */
  requiredForLaunch?: boolean;
};

const GROUPS: Array<{ title: string; items: ManageItem[] }> = [
  {
    title: 'Overview',
    items: [{ key: 'overview', label: 'Overview', meta: 'Your access and pending changes', section: '', exact: true }]
  },
  {
    title: 'Membership',
    items: [
      { key: 'token', label: 'Mint tokens', meta: 'Create new membership tokens', section: '/token' },
      {
        key: 'founders',
        label: 'Founder tokens',
        meta: 'Tokens for the founding team',
        section: '/founders',
        requiredForLaunch: true
      },
      { key: 'claims', label: 'Claim allocations', meta: 'Free tokens people can claim', section: '/claims' },
      {
        key: 'artwork',
        label: 'Artwork',
        meta: 'The art every token is drawn from',
        section: '/artwork',
        requiredForLaunch: true
      }
    ]
  },
  {
    title: 'Rules',
    items: [
      { key: 'governance', label: 'Voting rules', meta: 'Timing, quorum and who can propose', section: '/governance' },
      { key: 'owner', label: 'Who can mint', meta: 'Accounts allowed to mint tokens', section: '/owner' }
    ]
  },
  {
    title: 'Selling',
    items: [
      { key: 'auction', label: 'Auction', meta: 'Pause, pricing and timing', section: '/auction' },
      { key: 'marketplace', label: 'Market', meta: 'Listings, fees and pausing', section: '/marketplace' }
    ]
  },
  {
    title: 'System',
    items: [{ key: 'upgrades', label: 'Contract versions', meta: 'Review and propose upgrades', section: '/upgrades' }]
  }
];

const ALL_ITEMS = GROUPS.flatMap((group) => group.items);

const nav = sva({
  slots: ['root', 'group', 'title', 'list', 'link'],
  base: {
    root: {
      display: { base: 'none', lg: 'grid' },
      alignContent: 'start',
      gap: '5',
      position: 'sticky',
      top: '20'
    },
    group: { display: 'grid', gap: '1' },
    title: { textStyle: 'micro', color: 'ink.faint', px: '3', m: '0' },
    list: { display: 'grid', gap: '0.5', listStyle: 'none', m: '0', p: '0' },
    link: {
      display: 'flex',
      alignItems: 'center',
      minH: '10',
      px: '3',
      borderRadius: 'control',
      textStyle: 'body',
      color: 'ink.muted',
      textDecoration: 'none',
      transitionProperty: 'background-color, color',
      transitionDuration: 'fast',
      '@media (hover: hover) and (pointer: fine)': { _hover: { bg: 'hover', color: 'ink' } },
      '&[aria-current=page]': { bg: 'signal.wash', color: 'signal', fontWeight: '600' },
      _focusVisible: { outline: '2px solid', outlineColor: 'signal', outlineOffset: '-2px' }
    }
  }
});

const requiredTag = css({ ml: 'auto', textStyle: 'micro', color: 'warning', fontWeight: '600' });
const mobileTrigger = css({ display: { base: 'flex', lg: 'none' } });
const sheetGroup = css({ display: 'grid', gap: '1', mb: '4' });
const sheetTitle = css({ textStyle: 'micro', color: 'ink.faint', m: '0' });

/**
 * Manage sections in one grouped list: a sticky side list on wide screens, a
 * section picker in a sheet on phones.
 */
export function ManageNav({ routeId, inSetup = false }: { routeId: string; inSetup?: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useCloseOnNavigate(() => setOpen(false));
  const items = ALL_ITEMS.map((item) => ({ ...item, href: daoAdminRoute(routeId, item.section) as string }));
  const active = activeNavKey(pathname, items);
  const classes = nav();

  return (
    <>
      <nav className={classes.root} aria-label="Manage sections">
        {inSetup ? (
          <div className={classes.group}>
            <p className={classes.title}>Setup</p>
            <ul className={classes.list}>
              <li>
                <NextLink href={daoRoute(routeId, 'setup') as Route} className={classes.link}>
                  Launch checklist
                </NextLink>
              </li>
            </ul>
          </div>
        ) : null}
        {GROUPS.map((group) => (
          <div key={group.title} className={classes.group}>
            <p className={classes.title}>{group.title}</p>
            <ul className={classes.list}>
              {group.items.map((item) => (
                <li key={item.key}>
                  <NextLink
                    href={daoAdminRoute(routeId, item.section) as Route}
                    className={classes.link}
                    aria-current={active?.key === item.key ? 'page' : undefined}
                  >
                    {item.label}
                    {inSetup && item.requiredForLaunch ? <span className={requiredTag}>Required</span> : null}
                  </NextLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className={mobileTrigger}>
        <Button variant="secondary" block onClick={() => setOpen(true)} aria-haspopup="dialog">
          {active?.label ?? 'Overview'}
          <ChevronDown aria-hidden="true" />
        </Button>
      </div>
      <Sheet open={open} onOpenChange={setOpen} title="Manage">
        {inSetup ? (
          <div className={sheetGroup}>
            <p className={sheetTitle}>Setup</p>
            <ul className={css({ listStyle: 'none', m: '0', p: '0' })}>
              <ListRow
                as="li"
                href={daoRoute(routeId, 'setup')}
                title="Launch checklist"
                meta="What's left before launch"
              />
            </ul>
          </div>
        ) : null}
        {GROUPS.map((group) => (
          <div key={group.title} className={sheetGroup}>
            <p className={sheetTitle}>{group.title}</p>
            <ul className={css({ listStyle: 'none', m: '0', p: '0' })}>
              {group.items.map((item) => (
                <ListRow
                  key={item.key}
                  as="li"
                  href={daoAdminRoute(routeId, item.section)}
                  title={item.label}
                  meta={inSetup && item.requiredForLaunch ? `Required for launch · ${item.meta}` : item.meta}
                />
              ))}
            </ul>
          </div>
        ))}
      </Sheet>
    </>
  );
}
