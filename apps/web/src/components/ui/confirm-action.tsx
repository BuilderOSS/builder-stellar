'use client';

import { Popover as ArkPopover } from '@ark-ui/react/popover';
import { Portal } from '@ark-ui/react/portal';
import { type ReactNode, useState } from 'react';
import { css, cx } from 'styled-system/css';

import { Button } from './button';
import { floatingPanel } from './popover';

const panel = css({ display: 'grid', gap: '3', maxW: '80' });
const titleClass = css({ textStyle: 'subheading', fontSize: '0.9375rem', margin: '0', color: 'ink' });
const bodyClass = css({ textStyle: 'caption', fontSize: '0.875rem', color: 'ink.muted', margin: '0' });
const actions = css({ display: 'flex', justifyContent: 'flex-end', gap: '2' });

/**
 * Inline confirmation anchored to the button that asked for it. Use for
 * destructive or irreversible actions that don't need a full review dialog.
 */
export function ConfirmAction({
  trigger,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Keep it',
  tone = 'danger',
  onConfirm,
  busy
}: {
  trigger: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  onConfirm: () => void | Promise<void>;
  busy?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <ArkPopover.Root
      open={open}
      onOpenChange={(details) => setOpen(details.open)}
      positioning={{ placement: 'top', gutter: 8 }}
      lazyMount
      unmountOnExit
    >
      <ArkPopover.Trigger asChild>{trigger}</ArkPopover.Trigger>
      <Portal>
        <ArkPopover.Positioner>
          <ArkPopover.Content className={cx(floatingPanel, panel)}>
            <ArkPopover.Title className={titleClass}>{title}</ArkPopover.Title>
            {description ? <ArkPopover.Description className={bodyClass}>{description}</ArkPopover.Description> : null}
            <div className={actions}>
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                {cancelLabel}
              </Button>
              <Button
                variant={tone === 'danger' ? 'danger' : 'primary'}
                size="sm"
                loading={busy}
                onClick={async () => {
                  await onConfirm();
                  setOpen(false);
                }}
              >
                {confirmLabel}
              </Button>
            </div>
          </ArkPopover.Content>
        </ArkPopover.Positioner>
      </Portal>
    </ArkPopover.Root>
  );
}
