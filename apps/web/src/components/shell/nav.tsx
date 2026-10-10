'use client';

import type { LucideIcon } from 'lucide-react';
import type { Route } from 'next';
import NextLink from 'next/link';
import type { ReactNode } from 'react';
import { css, cx, sva } from 'styled-system/css';

import { Tooltip } from '@/components/ui';

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

const rail = sva({
  slots: ['root', 'top', 'list', 'item', 'icon', 'footer', 'separator'],
  base: {
    root: {
      display: { base: 'none', md: 'flex' },
      flexDirection: 'column',
      alignItems: 'center',
      gap: '2',
      position: 'sticky',
      top: '0',
      height: '100dvh',
      width: 'rail',
      py: '4',
      bg: 'surface',
      borderRightWidth: '1px',
      borderColor: 'rule',
      zIndex: 'bar'
    },
    top: { display: 'grid', placeItems: 'center', mb: '1' },
    list: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '1',
      listStyle: 'none',
      m: '0',
      p: '0'
    },
    item: {
      position: 'relative',
      display: 'grid',
      placeItems: 'center',
      width: '12',
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
      '@media (prefers-reduced-motion: reduce)': { _active: { scale: '1' } }
    },
    icon: { position: 'relative', display: 'inline-flex', '& svg': { width: '5.5', height: '5.5' } },
    footer: { mt: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1' },
    separator: { width: '7', height: '1px', bg: 'rule', my: '1' }
  }
});

/** Desktop and tablet navigation: icons with tooltips, active item marked in signal blue. */
export function NavRail({
  label,
  top,
  items,
  footerItems = [],
  activeKey,
  footer
}: {
  label: string;
  top?: ReactNode;
  items: ShellNavItem[];
  footerItems?: ShellNavItem[];
  activeKey?: string;
  footer?: ReactNode;
}) {
  const classes = rail();
  const renderItem = (item: ShellNavItem) => {
    const Icon = item.icon;
    const active = item.key === activeKey;
    return (
      <li key={item.key}>
        <Tooltip content={item.label} placement="right">
          <NextLink
            href={item.href as Route}
            className={classes.item}
            aria-current={active ? 'page' : undefined}
            aria-label={badgeLabel(item)}
          >
            <span className={classes.icon}>
              <Icon aria-hidden="true" strokeWidth={active ? 2.25 : 1.75} />
              <NavBadge value={item.badge} />
            </span>
          </NextLink>
        </Tooltip>
      </li>
    );
  };

  return (
    <nav className={classes.root} aria-label={label}>
      {top ? (
        <>
          <div className={classes.top}>{top}</div>
          <span className={classes.separator} aria-hidden="true" />
        </>
      ) : null}
      <ul className={classes.list}>{items.map(renderItem)}</ul>
      <div className={classes.footer}>
        {footerItems.length ? <ul className={classes.list}>{footerItems.map(renderItem)}</ul> : null}
        {footer}
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
