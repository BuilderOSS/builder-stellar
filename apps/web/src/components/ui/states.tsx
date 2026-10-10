import { CircleAlert, LoaderCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { css, cx } from 'styled-system/css';

const empty = css({
  display: 'grid',
  justifyItems: 'start',
  gap: '2',
  py: '6',
  px: '1'
});
const emptyTitle = css({ textStyle: 'subheading', color: 'ink', margin: '0' });
const emptyBody = css({ textStyle: 'body', color: 'ink.muted', margin: '0', maxW: '52ch' });
const emptyAction = css({ mt: '2' });

/**
 * Nothing here yet. Say what it is and when it will fill; offer the one
 * action that fills it, if the viewer can take it.
 */
export function EmptyState({
  title,
  children,
  action,
  icon
}: {
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className={empty} role="status">
      {icon}
      <p className={emptyTitle}>{title}</p>
      {children ? <div className={emptyBody}>{children}</div> : null}
      {action ? <div className={emptyAction}>{action}</div> : null}
    </div>
  );
}

const errorRoot = css({
  display: 'grid',
  gridTemplateColumns: 'auto minmax(0, 1fr)',
  gap: '3',
  p: '4',
  borderRadius: 'card',
  bg: 'danger.wash'
});
const errorIcon = css({ width: '5', height: '5', color: 'danger', mt: '0.5' });
const errorTitle = css({ textStyle: 'subheading', fontSize: '0.9375rem', color: 'ink', margin: '0' });
const errorBody = css({ textStyle: 'caption', fontSize: '0.875rem', color: 'ink.muted', margin: '0', mt: '1' });
const errorActions = css({ display: 'flex', flexWrap: 'wrap', gap: '2', mt: '3' });

/** Something failed. Name it plainly, show the cause, offer a retry and a way out. */
export function ErrorState({ title, cause, actions }: { title: ReactNode; cause?: ReactNode; actions?: ReactNode }) {
  return (
    <div className={errorRoot} role="alert">
      <CircleAlert aria-hidden="true" className={errorIcon} />
      <div>
        <p className={errorTitle}>{title}</p>
        {cause ? <p className={errorBody}>{cause}</p> : null}
        {actions ? <div className={errorActions}>{actions}</div> : null}
      </div>
    </div>
  );
}

const spinner = css({
  width: '5',
  height: '5',
  color: 'ink.muted',
  animation: 'spin 0.9s linear infinite',
  '@media (prefers-reduced-motion: reduce)': { animationDuration: '2.4s' }
});

export function Spinner({ label = 'Loading', className }: { label?: string; className?: string }) {
  return (
    <span role="status" className={css({ display: 'inline-flex' })}>
      <LoaderCircle aria-hidden="true" className={cx(spinner, className)} />
      <span className="sr-only">{label}</span>
    </span>
  );
}
