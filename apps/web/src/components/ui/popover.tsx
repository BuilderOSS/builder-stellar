'use client';

import { Popover as ArkPopover } from '@ark-ui/react/popover';
import { Portal } from '@ark-ui/react/portal';
import type { ReactNode } from 'react';
import { css, cx } from 'styled-system/css';

export const floatingPanel = css({
  zIndex: 'overlay',
  minW: '56',
  maxW: 'min(360px, calc(100vw - 24px))',
  p: '3',
  bg: 'raised',
  color: 'ink',
  borderRadius: 'card',
  boxShadow: 'float',
  outline: 'none',
  transformOrigin: 'var(--transform-origin)',
  _open: { animation: 'popIn 180ms token(easings.out)' },
  _closed: { animation: 'popOut 120ms token(easings.out)' },
  '@media (prefers-reduced-motion: reduce)': {
    _open: { animation: 'fadeIn 120ms linear' },
    _closed: { animation: 'fadeOut 120ms linear' }
  }
});

/** Anchored panel that grows from its trigger. */
export function Popover({
  trigger,
  children,
  open,
  onOpenChange,
  placement = 'bottom-end',
  className,
  label
}: {
  trigger: ReactNode;
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  placement?: 'bottom-start' | 'bottom-end' | 'bottom' | 'top' | 'top-start' | 'top-end' | 'right-start';
  className?: string;
  /** Accessible title when the content has no visible heading. */
  label?: string;
}) {
  return (
    <ArkPopover.Root
      open={open}
      onOpenChange={onOpenChange ? (details) => onOpenChange(details.open) : undefined}
      positioning={{ placement, gutter: 8 }}
      lazyMount
      unmountOnExit
    >
      <ArkPopover.Trigger asChild>{trigger}</ArkPopover.Trigger>
      <Portal>
        <ArkPopover.Positioner>
          <ArkPopover.Content className={cx(floatingPanel, className)} aria-label={label}>
            {children}
          </ArkPopover.Content>
        </ArkPopover.Positioner>
      </Portal>
    </ArkPopover.Root>
  );
}

export const PopoverClose = ArkPopover.CloseTrigger;
