'use client';

import { Dialog as ArkDialog } from '@ark-ui/react/dialog';
import { Portal } from '@ark-ui/react/portal';
import { type ReactNode, useId } from 'react';
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
      overflowX: 'hidden',
      display: 'grid',
      // minmax(0, 1fr) stops long unbreakable text (hashes, addresses) from widening the dialog.
      gridTemplateColumns: 'minmax(0, 1fr)',
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
    body: {
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr)',
      gap: '3',
      overflowWrap: 'anywhere',
      // Preflight sets `break-word` on p and headings, which still lets one long hash set the
      // column's minimum width; `anywhere` lets it wrap inside the dialog instead.
      '& :is(h1, h2, h3, h4, h5, h6, p)': { overflowWrap: 'anywhere' }
    },
    footer: {
      display: 'flex',
      flexDirection: { base: 'column-reverse', sm: 'row' },
      justifyContent: 'flex-end',
      gap: '2'
    }
  },
  variants: {
    instant: {
      // Opened from the keyboard (a search shortcut): no motion, so it is there on the keypress.
      true: {
        backdrop: { _open: { animation: 'none' }, _closed: { animation: 'none' } },
        content: {
          _open: { animation: 'none' },
          _closed: { animation: 'none' },
          '@media (prefers-reduced-motion: reduce)': { _open: { animation: 'none' }, _closed: { animation: 'none' } }
        }
      },
      false: {}
    }
  },
  defaultVariants: { instant: false }
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
  closeOnInteractOutside = true,
  initialFocusEl,
  finalFocusEl,
  instant = false
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  role?: 'dialog' | 'alertdialog';
  closeOnInteractOutside?: boolean;
  /** Element to focus on open, e.g. the safe choice in a destructive confirm. */
  initialFocusEl?: () => HTMLElement | null;
  /** Element to focus on close, when it isn't the one focused before opening (a shortcut opened it). */
  finalFocusEl?: () => HTMLElement | null;
  /** Open and close with no motion. */
  instant?: boolean;
}) {
  const classes = dialog({ instant });
  // Name and describe the dialog by explicit ids. Zag drops aria-labelledby when it looks for the title
  // before a lazily mounted portal has rendered it, which left a dialog opened after mount with no
  // accessible name (BUG-W02-3).
  const id = useId();
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;
  return (
    <ArkDialog.Root
      ids={{ title: titleId, description: descriptionId }}
      open={open}
      onOpenChange={(details) => onOpenChange(details.open)}
      role={role}
      closeOnInteractOutside={closeOnInteractOutside}
      initialFocusEl={initialFocusEl}
      finalFocusEl={finalFocusEl}
      lazyMount
      unmountOnExit
    >
      <Portal>
        <ArkDialog.Backdrop className={classes.backdrop} />
        <ArkDialog.Positioner className={classes.positioner}>
          <ArkDialog.Content
            className={classes.content}
            aria-labelledby={titleId}
            aria-describedby={description ? descriptionId : undefined}
          >
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
