'use client';

import { Dialog as ArkDialog } from '@ark-ui/react/dialog';
import { Portal } from '@ark-ui/react/portal';
import type { ReactNode } from 'react';
import { sva } from 'styled-system/css';

const dialog = sva({
  slots: ['backdrop', 'positioner', 'content', 'title', 'description', 'body', 'footer'],
  base: {
    backdrop: {
      position: 'fixed',
      inset: '0',
      zIndex: 'overlay',
      bg: 'scrim',
      _open: { animation: 'fadeIn 200ms token(easings.out)' },
      _closed: { animation: 'fadeOut 150ms token(easings.out)' }
    },
    positioner: {
      position: 'fixed',
      inset: '0',
      zIndex: 'overlay',
      display: 'grid',
      placeItems: 'center',
      p: '4'
    },
    content: {
      width: 'min(480px, 100%)',
      maxH: 'calc(100dvh - 32px)',
      overflowY: 'auto',
      display: 'grid',
      gap: '4',
      p: '6',
      bg: 'surface',
      color: 'ink',
      borderRadius: 'sheet',
      boxShadow: 'float',
      outline: 'none',
      _open: { animation: 'popIn 200ms token(easings.out)' },
      _closed: { animation: 'popOut 150ms token(easings.out)' },
      '@media (prefers-reduced-motion: reduce)': {
        _open: { animation: 'fadeIn 150ms linear' },
        _closed: { animation: 'fadeOut 150ms linear' }
      }
    },
    title: { textStyle: 'title', fontSize: '1.25rem', margin: '0' },
    description: { textStyle: 'body', color: 'ink.muted', margin: '0' },
    body: { display: 'grid', gap: '3' },
    footer: {
      display: 'flex',
      flexDirection: { base: 'column-reverse', sm: 'row' },
      justifyContent: 'flex-end',
      gap: '2'
    }
  }
});

/**
 * Centered modal for confirmations that must interrupt (transaction review).
 * Prefer Sheet or inline content for everything else.
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  role = 'dialog',
  closeOnInteractOutside = true
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  role?: 'dialog' | 'alertdialog';
  closeOnInteractOutside?: boolean;
}) {
  const classes = dialog();
  return (
    <ArkDialog.Root
      open={open}
      onOpenChange={(details) => onOpenChange(details.open)}
      role={role}
      closeOnInteractOutside={closeOnInteractOutside}
      lazyMount
      unmountOnExit
    >
      <Portal>
        <ArkDialog.Backdrop className={classes.backdrop} />
        <ArkDialog.Positioner className={classes.positioner}>
          <ArkDialog.Content className={classes.content}>
            <div>
              <ArkDialog.Title className={classes.title}>{title}</ArkDialog.Title>
              {description ? (
                <ArkDialog.Description className={classes.description}>{description}</ArkDialog.Description>
              ) : null}
            </div>
            {children ? <div className={classes.body}>{children}</div> : null}
            {footer ? <div className={classes.footer}>{footer}</div> : null}
          </ArkDialog.Content>
        </ArkDialog.Positioner>
      </Portal>
    </ArkDialog.Root>
  );
}
