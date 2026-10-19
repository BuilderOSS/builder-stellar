'use client';

import { Portal } from '@ark-ui/react/portal';
import { Toast, Toaster } from '@ark-ui/react/toast';
import { ArrowUpRight, CircleAlert, CircleCheck, Info, LoaderCircle, Undo2, X } from 'lucide-react';
import { css, sva } from 'styled-system/css';

import type { ToastUndo } from '@/lib/proposal-changes/change-toast';
import { toaster } from '@/lib/toaster';

const toast = sva({
  slots: ['root', 'title', 'icon', 'description', 'actions', 'action', 'close'],
  base: {
    root: {
      position: 'relative',
      display: 'grid',
      gap: '1.5',
      width: 'min(400px, calc(100vw - 24px))',
      p: '3.5',
      pr: '11',
      bg: 'raised',
      color: 'ink',
      borderRadius: 'card',
      boxShadow: 'float',
      // Ark drives these variables for stacking and enter/exit.
      translate: 'var(--x) var(--y)',
      scale: 'var(--scale)',
      zIndex: 'var(--z-index)',
      height: 'var(--height)',
      opacity: 'var(--opacity)',
      willChange: 'translate, opacity, scale',
      transitionProperty: 'translate, scale, opacity, height',
      transitionDuration: '300ms',
      transitionTimingFunction: 'out',
      '@media (prefers-reduced-motion: reduce)': { transitionProperty: 'opacity', transitionDuration: '150ms' }
    },
    actions: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: '4', rowGap: '1' },
    title: { display: 'flex', alignItems: 'center', gap: '2', textStyle: 'subheading', fontSize: '0.9375rem' },
    icon: { width: '4.5', height: '4.5', flexShrink: '0' },
    description: { textStyle: 'caption', fontSize: '0.875rem', color: 'ink.muted', overflowWrap: 'anywhere' },
    action: {
      justifySelf: 'start',
      display: 'inline-flex',
      alignItems: 'center',
      gap: '1',
      mt: '1',
      p: '0',
      bg: 'transparent',
      border: '0',
      color: 'signal',
      textStyle: 'label',
      cursor: 'pointer',
      _hover: { textDecoration: 'underline' },
      '& svg': { width: '3.5', height: '3.5' }
    },
    close: {
      position: 'absolute',
      top: '1',
      right: '1',
      display: 'grid',
      placeItems: 'center',
      width: 'touch',
      height: 'touch',
      bg: 'transparent',
      border: '0',
      borderRadius: 'control',
      color: 'ink.muted',
      cursor: 'pointer',
      _hover: { color: 'ink', bg: 'hover' },
      '& svg': { width: '4', height: '4' }
    }
  }
});

const toneSuccess = css({ color: 'success' });
const toneError = css({ color: 'danger' });
const toneInfo = css({ color: 'signal' });
const spinning = css({
  color: 'signal',
  animation: 'spin 1s linear infinite',
  '@media (prefers-reduced-motion: reduce)': { animationDuration: '2.4s' }
});

function ToastIcon({ type, className = '' }: { type: string | undefined; className?: string }) {
  switch (type) {
    case 'success':
      return <CircleCheck aria-hidden="true" className={`${className} ${toneSuccess}`} />;
    case 'error':
      return <CircleAlert aria-hidden="true" className={`${className} ${toneError}`} />;
    case 'loading':
      return <LoaderCircle aria-hidden="true" className={`${className} ${spinning}`} />;
    default:
      return <Info aria-hidden="true" className={`${className} ${toneInfo}`} />;
  }
}

/** The main action, plus an Undo from `meta.undo` for changes that can be taken back. */
function ToastActions({
  item,
  classes
}: {
  item: { id?: string; action?: { label: string }; meta?: Record<string, unknown> };
  classes: ReturnType<typeof toast>;
}) {
  const undo = item.meta?.undo as ToastUndo | undefined;
  if (!item.action && !undo) return null;
  return (
    <div className={classes.actions}>
      {undo ? (
        <button
          type="button"
          className={classes.action}
          onClick={() => {
            undo.onClick();
            if (item.id) toaster.dismiss(item.id);
          }}
        >
          <Undo2 aria-hidden="true" />
          {undo.label}
        </button>
      ) : null}
      {item.action ? (
        <Toast.ActionTrigger className={classes.action}>
          {item.action.label}
          <ArrowUpRight aria-hidden="true" />
        </Toast.ActionTrigger>
      ) : null}
    </div>
  );
}

export function AppToaster() {
  const classes = toast();
  return (
    <Portal>
      <Toaster toaster={toaster}>
        {(item) => (
          <Toast.Root key={item.id} className={classes.root}>
            <Toast.Title className={classes.title}>
              <ToastIcon type={item.type} className={classes.icon} />
              {item.title}
            </Toast.Title>
            {item.description ? (
              <Toast.Description className={classes.description}>{item.description}</Toast.Description>
            ) : null}
            <ToastActions item={item} classes={classes} />
            <Toast.CloseTrigger aria-label="Dismiss notification" className={classes.close}>
              <X aria-hidden="true" />
            </Toast.CloseTrigger>
          </Toast.Root>
        )}
      </Toaster>
    </Portal>
  );
}
