'use client';

import { Menu as ArkMenu } from '@ark-ui/react/menu';
import { Portal } from '@ark-ui/react/portal';
import type { ReactNode } from 'react';
import { css, cx } from 'styled-system/css';

import { floatingPanel } from './popover';

const content = css({ p: '1.5', minW: '52' });
const item = css({
  display: 'flex',
  alignItems: 'center',
  gap: '2.5',
  minH: '10',
  px: '2.5',
  borderRadius: 'sm',
  textStyle: 'body',
  color: 'ink',
  cursor: 'pointer',
  textDecoration: 'none',
  outline: 'none',
  '& svg': { width: '4', height: '4', color: 'ink.muted', flexShrink: '0' },
  _highlighted: { bg: 'hover' },
  '&[data-tone=danger]': { color: 'danger', '& svg': { color: 'danger' } },
  _disabled: { opacity: '0.5', cursor: 'not-allowed' },
  '@media (pointer: coarse)': { minH: 'touch' }
});
const separator = css({ my: '1', borderTopWidth: '1px', borderColor: 'rule' });

export type MenuEntry =
  | {
      value: string;
      label: ReactNode;
      icon?: ReactNode;
      onSelect?: () => void;
      href?: string;
      external?: boolean;
      tone?: 'danger';
      disabled?: boolean;
    }
  | { separator: true; value: string };

/** Action menu with full keyboard support (arrows, typeahead, Escape). */
export function Menu({
  trigger,
  items,
  placement = 'bottom-end',
  label
}: {
  trigger: ReactNode;
  items: MenuEntry[];
  placement?: 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end' | 'right-end';
  label?: string;
}) {
  return (
    <ArkMenu.Root positioning={{ placement, gutter: 6 }} lazyMount unmountOnExit>
      <ArkMenu.Trigger asChild>{trigger}</ArkMenu.Trigger>
      <Portal>
        <ArkMenu.Positioner>
          <ArkMenu.Content className={cx(floatingPanel, content)} aria-label={label}>
            {items.map((entry) =>
              'separator' in entry ? (
                <ArkMenu.Separator key={entry.value} className={separator} />
              ) : entry.href ? (
                <ArkMenu.Item key={entry.value} value={entry.value} disabled={entry.disabled} asChild>
                  <a
                    className={item}
                    href={entry.href}
                    data-tone={entry.tone}
                    target={entry.external ? '_blank' : undefined}
                    rel={entry.external ? 'noreferrer' : undefined}
                  >
                    {entry.icon}
                    {entry.label}
                  </a>
                </ArkMenu.Item>
              ) : (
                <ArkMenu.Item
                  key={entry.value}
                  value={entry.value}
                  disabled={entry.disabled}
                  onSelect={entry.onSelect}
                  className={item}
                  data-tone={entry.tone}
                >
                  {entry.icon}
                  {entry.label}
                </ArkMenu.Item>
              )
            )}
          </ArkMenu.Content>
        </ArkMenu.Positioner>
      </Portal>
    </ArkMenu.Root>
  );
}
