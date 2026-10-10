'use client';

import type { LucideIcon } from 'lucide-react';
import { LayoutGrid } from 'lucide-react';
import type { Route } from 'next';
import NextLink from 'next/link';
import { css, cx, sva } from 'styled-system/css';

import { Crest } from '@/components/ui';

import { BrandMark } from './brand-mark';

export type ShellNavItem = {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  exact?: boolean;
  /** Small count or dot on the icon (e.g. open votes, a saved draft). */
  badge?: number | boolean;
};

const badgeClass = css({
  position: 'absolute',
  top: '-1',
  right: '-2',
  minW: '4',
  h: '4',
  px: '1',
  borderRadius: 'full',
  bg: 'signal',
  color: 'primary.fg',
  fontSize: '0.625rem',
  fontWeight: '700',
  lineHeight: '4',
  textAlign: 'center',
  boxShadow: '0 0 0 2px token(colors.surface)',
  '&[data-dot]': { minW: '2', h: '2', px: '0', top: '0', right: '-0.5' }
});

function NavBadge({ value }: { value: ShellNavItem['badge'] }) {
  if (!value) return null;
  return value === true ? (
    <span className={badgeClass} data-dot="" aria-hidden="true" />
  ) : (
    <span className={badgeClass} aria-hidden="true">
      {value > 9 ? '9+' : value}
    </span>
  );
}

function badgeLabel(item: ShellNavItem) {
  if (!item.badge) return item.label;
  return item.badge === true ? `${item.label}, new` : `${item.label}, ${item.badge}`;
}

const RAIL_OPEN_WIDTH = '232px';

const rail = sva({
  slots: ['root', 'panel', 'list', 'item', 'icon', 'label', 'footer', 'separator', 'brand', 'groupLabel'],
  base: {
    // The root holds the 72px column; the panel inside floats over the page when it widens,
    // so opening the rail never reflows content.
    root: {
      display: { base: 'none', md: 'block' },
      position: 'sticky',
      top: '0',
      height: '100dvh',
      width: 'rail',
      zIndex: 'rail'
    },
    panel: {
      position: 'absolute',
      insetY: '0',
      left: '0',
      display: 'flex',
      flexDirection: 'column',
      gap: '2',
      width: 'rail',
      py: '4',
      px: '3',
      overflowX: 'hidden',
      overflowY: 'auto',
      bg: 'surface',
      borderRightWidth: '1px',
      borderColor: 'rule',
      // Width is the one layout property animated here: the panel is out of flow and holds a
      // handful of rows, so the cost is tiny and rows keep their real shape as it grows.
      transitionProperty: 'width, box-shadow',
      transitionDuration: '160ms',
      transitionTimingFunction: 'out',
      transitionDelay: '0ms',
      // Open on a deliberate hover (pointer devices only) or keyboard focus, never on a tap.
      '@media (hover: hover) and (pointer: fine)': {
        '[data-rail]:hover > &': {
          width: RAIL_OPEN_WIDTH,
          boxShadow: 'float',
          transitionDuration: '220ms',
          transitionDelay: '120ms'
        }
      },
      '[data-rail]:has(:focus-visible) > &': { width: RAIL_OPEN_WIDTH, boxShadow: 'float' },
      _motionReduce: { transitionDuration: '0ms !important' }
    },
    list: { display: 'flex', flexDirection: 'column', gap: '1', listStyle: 'none', m: '0', p: '0' },
    item: {
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      width: '100%',
      height: '12',
      borderRadius: '14px',
      color: 'ink.muted',
      textDecoration: 'none',
      transitionProperty: 'background-color, color, scale',
      transitionDuration: 'press',
      transitionTimingFunction: 'out',
      _active: { scale: '0.96' },
      '@media (hover: hover) and (pointer: fine)': { _hover: { bg: 'hover', color: 'ink' } },
      _focusVisible: { outline: '2px solid', outlineColor: 'signal', outlineOffset: '2px' },
      '&[aria-current=page]': {
        color: 'signal',
        bg: 'signal.wash',
        _before: {
          content: '""',
          position: 'absolute',
          left: '-3',
          top: '3',
          bottom: '3',
          width: '3px',
          borderRightRadius: 'full',
          bg: 'signal'
        }
      },
      '&[data-tone=primary]': {
        bg: 'primary',
        color: 'primary.fg',
        '@media (hover: hover) and (pointer: fine)': { _hover: { bg: 'primary.hover', color: 'primary.fg' } }
      },
      '@media (prefers-reduced-motion: reduce)': { _active: { scale: '1' } }
    },
    icon: {
      position: 'relative',
      display: 'grid',
      placeItems: 'center',
      width: '12',
      height: '12',
      flexShrink: '0',
      '& > svg.lucide': { width: '5.5', height: '5.5' }
    },
    // Labels stay in the DOM (they name the links); they fade in once the panel has room.
    label: {
      pr: '3',
      whiteSpace: 'nowrap',
      textStyle: 'label',
      fontSize: '0.875rem',
      opacity: '0',
      transform: 'translateX(-4px)',
      transitionProperty: 'opacity, transform',
      transitionDuration: '100ms',
      transitionTimingFunction: 'out',
      '@media (hover: hover) and (pointer: fine)': {
        '[data-rail]:hover &': {
          opacity: '1',
          transform: 'translateX(0)',
          transitionDuration: '200ms',
          transitionDelay: '180ms'
        }
      },
      '[data-rail]:has(:focus-visible) &': { opacity: '1', transform: 'translateX(0)' },
      _motionReduce: { transform: 'none' }
    },
    brand: { fontFamily: 'display', fontWeight: '700', fontSize: '1.0625rem', color: 'ink' },
    footer: { mt: 'auto', display: 'flex', flexDirection: 'column', gap: '1' },
    separator: { height: '1px', bg: 'rule', my: '1', mx: '2' },
    // Group caption; it shares the label fade, so it only reads while the rail is open.
    groupLabel: {
      textStyle: 'caption',
      fontWeight: '600',
      color: 'ink.muted',
      pl: '3',
      minH: '5',
      lineHeight: '1.25rem'
    }
  }
});

/**
 * Desktop and tablet navigation: a 72px icon rail that widens on hover (or keyboard focus)
 * to show labels. The active item is marked in signal blue.
 */
export type RailCommunity = { key: string; label: string; href: string; seed: string; image?: string | null };
export const RAIL_COMMUNITY_LIMIT = 5;

export function NavRail({
  label,
  homeHref = '/',
  items,
  footerItems = [],
  activeKey,
  action,
  communities = [],
  communitiesHref = '/'
}: {
  label: string;
  homeHref?: string;
  items: ShellNavItem[];
  footerItems?: ShellNavItem[];
  activeKey?: string;
  /** One filled action pinned to the bottom, e.g. Start a DAO. */
  action?: Pick<ShellNavItem, 'label' | 'href' | 'icon'>;
  /** Shortcuts to the viewer's own communities, shown as crests under the main items. */
  communities?: RailCommunity[];
  /** Where "All your communities" goes when there are more than fit. */
  communitiesHref?: string;
}) {
  const classes = rail();
  const renderItem = (item: ShellNavItem) => {
    const Icon = item.icon;
    const active = item.key === activeKey;
    return (
      <li key={item.key}>
        <NextLink href={item.href as Route} className={classes.item} aria-current={active ? 'page' : undefined}>
          <span className={classes.icon}>
            <Icon aria-hidden="true" strokeWidth={active ? 2.25 : 1.75} />
            <NavBadge value={item.badge} />
          </span>
          <span className={classes.label}>{item.label}</span>
          {item.badge ? <span className="sr-only">{badgeLabel(item).slice(item.label.length)}</span> : null}
        </NextLink>
      </li>
    );
  };

  return (
    <nav className={classes.root} aria-label={label} data-rail="">
      <div className={classes.panel}>
        <NextLink href={homeHref as Route} className={classes.item}>
          <span className={classes.icon}>
            <BrandMark size={36} />
          </span>
          <span className={cx(classes.label, classes.brand)}>Builder</span>
          <span className="sr-only"> home</span>
        </NextLink>
        <span className={classes.separator} aria-hidden="true" />
        <ul className={classes.list}>{items.map(renderItem)}</ul>
        {communities.length ? (
          <>
            <span className={classes.separator} aria-hidden="true" />
            <span className={cx(classes.label, classes.groupLabel)} id="rail-communities-label">
              Yours
            </span>
            <ul className={classes.list} aria-labelledby="rail-communities-label">
              {communities.slice(0, RAIL_COMMUNITY_LIMIT).map((community) => (
                <li key={community.key}>
                  <NextLink href={community.href as Route} className={classes.item}>
                    <span className={classes.icon}>
                      <Crest name={community.label} seed={community.seed} src={community.image} size="sm" />
                    </span>
                    <span className={classes.label}>{community.label}</span>
                  </NextLink>
                </li>
              ))}
              {communities.length > RAIL_COMMUNITY_LIMIT ? (
                <li>
                  <NextLink href={communitiesHref as Route} className={classes.item}>
                    <span className={classes.icon}>
                      <LayoutGrid aria-hidden="true" strokeWidth={1.75} />
                    </span>
                    <span className={classes.label}>All your communities</span>
                  </NextLink>
                </li>
              ) : null}
            </ul>
          </>
        ) : null}
        <div className={classes.footer}>
          {footerItems.length ? <ul className={classes.list}>{footerItems.map(renderItem)}</ul> : null}
          {action ? (
            <NextLink href={action.href as Route} className={classes.item} data-tone="primary">
              <span className={classes.icon}>
                <action.icon aria-hidden="true" strokeWidth={2.25} />
              </span>
              <span className={classes.label}>{action.label}</span>
            </NextLink>
          ) : null}
        </div>
      </div>
    </nav>
  );
}

const tabbar = sva({
  slots: ['root', 'item', 'icon', 'label'],
  base: {
    root: {
      display: { base: 'grid', md: 'none' },
      gridAutoFlow: 'column',
      gridAutoColumns: '1fr',
      position: 'fixed',
      zIndex: 'bar',
      left: '0',
      right: '0',
      bottom: '0',
      minH: 'tabbar',
      pb: 'env(safe-area-inset-bottom)',
      px: '1',
      bg: 'surface',
      borderTopWidth: '1px',
      borderColor: 'rule'
    },
    item: {
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '1',
      minH: 'tabbar',
      p: '0',
      bg: 'transparent',
      border: '0',
      color: 'ink.muted',
      textDecoration: 'none',
      cursor: 'pointer',
      transitionProperty: 'color, scale',
      transitionDuration: 'press',
      transitionTimingFunction: 'out',
      _active: { scale: '0.94' },
      _focusVisible: { outline: '2px solid', outlineColor: 'signal', outlineOffset: '-4px', borderRadius: 'control' },
      '&[aria-current=page], &[data-active]': {
        color: 'signal',
        _before: {
          content: '""',
          position: 'absolute',
          top: '0',
          width: '6',
          height: '3px',
          borderBottomRadius: 'full',
          bg: 'signal'
        }
      },
      '@media (prefers-reduced-motion: reduce)': { _active: { scale: '1' } }
    },
    icon: { position: 'relative', display: 'inline-flex', '& svg': { width: '5.5', height: '5.5' } },
    label: { fontSize: '0.6875rem', fontWeight: '600', lineHeight: '1' }
  }
});

/** Phone navigation: a fixed bottom bar of up to five labelled tabs. */
export function TabBar({
  label,
  items,
  activeKey,
  extra
}: {
  label: string;
  items: ShellNavItem[];
  activeKey?: string;
  /** A trailing tab that opens something instead of navigating (More, You). */
  extra?: { label: string; icon: LucideIcon; onClick: () => void; active?: boolean; badge?: number | boolean };
}) {
  const classes = tabbar();
  return (
    <nav className={classes.root} aria-label={label}>
      {items.map((item) => {
        const Icon = item.icon;
        const active = item.key === activeKey;
        return (
          <NextLink
            key={item.key}
            href={item.href as Route}
            className={classes.item}
            aria-current={active ? 'page' : undefined}
          >
            <span className={classes.icon}>
              <Icon aria-hidden="true" strokeWidth={active ? 2.25 : 1.75} />
              <NavBadge value={item.badge} />
            </span>
            <span className={classes.label}>{item.label}</span>
          </NextLink>
        );
      })}
      {extra ? (
        <button
          type="button"
          className={cx(classes.item)}
          onClick={extra.onClick}
          data-active={extra.active ? '' : undefined}
          aria-haspopup="dialog"
        >
          <span className={classes.icon}>
            <extra.icon aria-hidden="true" strokeWidth={extra.active ? 2.25 : 1.75} />
            <NavBadge value={extra.badge} />
          </span>
          <span className={classes.label}>{extra.label}</span>
        </button>
      ) : null}
    </nav>
  );
}
