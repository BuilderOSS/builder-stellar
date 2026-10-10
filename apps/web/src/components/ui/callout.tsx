import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { sva } from 'styled-system/css';

type CalloutVariant = 'info' | 'warning' | 'error' | 'success';

const callout = sva({
  slots: ['root', 'icon', 'body', 'title', 'description', 'label'],
  base: {
    root: {
      display: 'grid',
      gridTemplateColumns: 'auto minmax(0, 1fr)',
      gap: '3',
      p: '4',
      borderRadius: 'card',
      color: 'ink'
    },
    icon: { width: '5', height: '5', mt: '0.5', flexShrink: '0' },
    body: { display: 'grid', gap: '1', minW: '0' },
    title: { textStyle: 'subheading', fontSize: '0.9375rem', color: 'ink', margin: '0' },
    description: { textStyle: 'caption', fontSize: '0.875rem', color: 'ink.muted', margin: '0' },
    label: { textStyle: 'micro', color: 'ink.muted' }
  },
  variants: {
    variant: {
      info: { root: { bg: 'signal.wash' }, icon: { color: 'signal' } },
      success: { root: { bg: 'success.wash' }, icon: { color: 'success' } },
      warning: { root: { bg: 'warning.wash' }, icon: { color: 'warning' } },
      error: { root: { bg: 'danger.wash' }, icon: { color: 'danger' } }
    }
  },
  defaultVariants: { variant: 'info' }
});

const ICONS: Record<CalloutVariant, typeof Info> = {
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  error: CircleAlert
};

const LABELS: Record<CalloutVariant, string> = {
  info: 'Note',
  success: 'Done',
  warning: 'Warning',
  error: 'Error'
};

/**
 * Inline status message. State is carried by icon, tint and an accessible
 * label, never by colour alone.
 */
export function Callout({
  variant = 'info',
  title,
  description,
  children,
  badge,
  role
}: {
  variant?: CalloutVariant;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** Optional visible label above the title (e.g. "Deferred refund"). */
  badge?: ReactNode;
  role?: 'status' | 'alert';
}) {
  const classes = callout({ variant });
  const Icon = ICONS[variant];

  return (
    <div className={classes.root} role={role}>
      <Icon className={classes.icon} aria-hidden="true" strokeWidth={2} />
      <div className={classes.body}>
        {badge ? <span className={classes.label}>{badge}</span> : <span className="sr-only">{LABELS[variant]}: </span>}
        <p className={classes.title}>{title}</p>
        {description ? <div className={classes.description}>{description}</div> : null}
        {children}
      </div>
    </div>
  );
}
