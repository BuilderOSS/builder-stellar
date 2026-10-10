'use client';

import { Dialog } from '@ark-ui/react/dialog';
import { Portal } from '@ark-ui/react/portal';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { sva } from 'styled-system/css';

import { IconButton } from './button';

const sheet = sva({
  slots: ['backdrop', 'positioner', 'content', 'grabber', 'header', 'title', 'description', 'body', 'footer'],
  base: {
    backdrop: {
      position: 'fixed',
      inset: '0',
      zIndex: 'overlay',
      bg: 'scrim',
      _open: { animation: 'fadeIn 240ms token(easings.out)' },
      _closed: { animation: 'fadeOut 180ms token(easings.out)' }
    },
    positioner: {
      position: 'fixed',
      inset: '0',
      zIndex: 'overlay',
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'center',
      md: { alignItems: 'stretch', justifyContent: 'flex-end' }
    },
    content: {
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
      maxH: '88dvh',
      bg: 'surface',
      color: 'ink',
      boxShadow: 'float',
      borderTopRadius: 'sheet',
      pb: 'env(safe-area-inset-bottom)',
      outline: 'none',
      _open: { animation: 'sheetUpIn 240ms token(easings.drawer)' },
      _closed: { animation: 'sheetUpOut 180ms token(easings.out)' },
      md: {
        width: 'min(420px, 100vw)',
        maxH: '100dvh',
        height: '100dvh',
        borderTopRadius: '0',
        borderLeftRadius: 'sheet',
        pb: '0',
        _open: { animation: 'sheetLeftIn 240ms token(easings.drawer)' },
        _closed: { animation: 'sheetLeftOut 180ms token(easings.out)' }
      },
      '@media (prefers-reduced-motion: reduce)': {
        _open: { animation: 'fadeIn 150ms linear' },
        _closed: { animation: 'fadeOut 150ms linear' }
      }
    },
    grabber: {
      alignSelf: 'center',
      width: '10',
      height: '1',
      mt: '2.5',
      borderRadius: 'full',
      bg: 'rule.strong',
      md: { display: 'none' }
    },
    header: {
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: '3',
      px: '5',
      pt: '3',
      pb: '2',
      md: { pt: '5' }
    },
    title: { textStyle: 'heading', margin: '0' },
    description: { textStyle: 'caption', color: 'ink.muted', mt: '1' },
    body: { flex: '1', overflowY: 'auto', overscrollBehavior: 'contain', px: '5', pb: '5' },
    footer: {
      display: 'flex',
      gap: '2',
      px: '5',
      py: '3',
      borderTopWidth: '1px',
      borderColor: 'rule',
      '& > *': { flex: '1' }
    }
  }
});

/**
 * Bottom sheet on phones, side panel from md. Focus is trapped inside and
 * returned to the trigger on close (Ark Dialog).
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  hideTitle = false,
  children,
  footer,
  trigger
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  /** Keep the title for screen readers but hide it visually. */
  hideTitle?: boolean;
  children: ReactNode;
  footer?: ReactNode;
  /** Optional trigger element (rendered via Dialog.Trigger asChild). */
  trigger?: ReactNode;
}) {
  const classes = sheet();
  return (
    <Dialog.Root
      open={open}
      onOpenChange={onOpenChange ? (details) => onOpenChange(details.open) : undefined}
      lazyMount
      unmountOnExit
    >
      {trigger ? <Dialog.Trigger asChild>{trigger}</Dialog.Trigger> : null}
      <Portal>
        <Dialog.Backdrop className={classes.backdrop} />
        <Dialog.Positioner className={classes.positioner}>
          <Dialog.Content className={classes.content}>
            <span className={classes.grabber} aria-hidden="true" />
            <div className={classes.header}>
              <div>
                <Dialog.Title className={hideTitle ? 'sr-only' : classes.title}>{title}</Dialog.Title>
                {description ? (
                  <Dialog.Description className={classes.description}>{description}</Dialog.Description>
                ) : null}
              </div>
              <Dialog.CloseTrigger asChild>
                <IconButton label="Close" size="sm">
                  <X aria-hidden="true" />
                </IconButton>
              </Dialog.CloseTrigger>
            </div>
            <div className={classes.body}>{children}</div>
            {footer ? <div className={classes.footer}>{footer}</div> : null}
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
