'use client';

import { Portal } from '@ark-ui/react/portal';
import { Tooltip as ArkTooltip } from '@ark-ui/react/tooltip';
import type { ReactNode } from 'react';
import { css } from 'styled-system/css';

const content = css({
  zIndex: 'toast',
  maxW: '64',
  px: '2.5',
  py: '1.5',
  borderRadius: 'sm',
  bg: 'ink',
  color: 'canvas',
  textStyle: 'micro',
  fontWeight: '500',
  transformOrigin: 'var(--transform-origin)',
  _open: { animation: 'popIn 140ms token(easings.out)' },
  _closed: { animation: 'fadeOut 100ms linear' },
  '@media (prefers-reduced-motion: reduce)': { _open: { animation: 'fadeIn 100ms linear' } }
});

/**
 * Hover/focus hint. Never the only place important information lives: on
 * touch it only appears on long-press.
 */
export function Tooltip({
  content: label,
  children,
  placement = 'top',
  disabled,
  id
}: {
  content: ReactNode;
  children: ReactNode;
  placement?: 'top' | 'right' | 'bottom' | 'left';
  disabled?: boolean;
  /** Stable id for tooltips in persistent chrome (avoids SSR id drift). */
  id?: string;
}) {
  if (disabled) return <>{children}</>;
  return (
    <ArkTooltip.Root
      id={id}
      openDelay={400}
      closeDelay={80}
      positioning={{ placement, gutter: 8 }}
      lazyMount
      unmountOnExit
    >
      <ArkTooltip.Trigger asChild>{children}</ArkTooltip.Trigger>
      <Portal>
        <ArkTooltip.Positioner>
          <ArkTooltip.Content className={content}>{label}</ArkTooltip.Content>
        </ArkTooltip.Positioner>
      </Portal>
    </ArkTooltip.Root>
  );
}
