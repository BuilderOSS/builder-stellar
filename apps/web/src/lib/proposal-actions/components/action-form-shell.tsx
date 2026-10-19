// src/lib/proposal-actions/components/action-form-shell.tsx

'use client';

import { ArrowUpRight, ChevronLeft } from 'lucide-react';
import type { Route } from 'next';
import type { ReactNode } from 'react';
import { css } from 'styled-system/css';

import { Button, ButtonLink, Callout, Skeleton } from '@/components/ui';

import type { PreconditionResult } from '../types';

export interface ActionFormShellProps {
  mode: 'create' | 'edit';
  actionLabel: string;
  description?: string;
  /** The live value, "3 days", when the setting can be read. */
  now?: string;
  /** Where the change lives in Manage, for "Open in Manage". */
  home?: { label: string; href: Route };
  disabled: boolean;
  preconditionResult?: PreconditionResult;
  /** Back to choosing another change (create) or out of the edit. */
  onBack: () => void;
  onSave: () => void;
  onCancel: () => void;
  children: ReactNode;
}

const shell = css({ display: 'grid', gap: '4' });
const head = css({ display: 'grid', gap: '1' });
const title = css({ textStyle: 'heading', fontSize: '1.0625rem', m: '0' });
const muted = css({ textStyle: 'caption', color: 'ink.muted', m: '0' });
const context = css({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '2'
});
const now = css({ textStyle: 'caption', color: 'ink.muted', m: '0', '& strong': { color: 'ink', fontWeight: '600' } });
const footer = css({ display: 'flex', justifyContent: 'space-between', gap: '2', pt: '1' });
const back = css({ justifySelf: 'start', ml: '-3' });

/** One change being set up: what it is, what it is now, its form, and saving it into the proposal. */
export function ActionFormShell({
  mode,
  actionLabel,
  description,
  now: current,
  home,
  disabled,
  preconditionResult,
  onBack,
  onSave,
  onCancel,
  children
}: ActionFormShellProps) {
  return (
    <section className={shell} aria-label={mode === 'edit' ? `Edit: ${actionLabel}` : actionLabel}>
      {mode === 'create' ? (
        <Button variant="ghost" size="sm" className={back} onClick={onBack} disabled={disabled}>
          <ChevronLeft aria-hidden="true" />
          All changes
        </Button>
      ) : null}
      <div className={head}>
        <h3 className={title}>{actionLabel}</h3>
        {description ? <p className={muted}>{description}</p> : null}
      </div>
      {current || home ? (
        <div className={context}>
          {current ? (
            <p className={now}>
              Now: <strong>{current}</strong>
            </p>
          ) : (
            <span />
          )}
          {home ? (
            <ButtonLink href={home.href} variant="link" size="sm">
              Open in {home.label}
              <ArrowUpRight aria-hidden="true" />
            </ButtonLink>
          ) : null}
        </div>
      ) : null}
      {preconditionResult && !preconditionResult.canExecute && preconditionResult.loading ? (
        <div role="status" aria-busy="true">
          <span className="sr-only">Checking what this change needs</span>
          <Skeleton className={css({ width: '56', height: '4' })} />
        </div>
      ) : null}
      {preconditionResult && !preconditionResult.canExecute && !preconditionResult.loading ? (
        <Callout variant="error" title={preconditionResult.reason} />
      ) : null}

      {children}

      <div className={footer}>
        <Button variant="ghost" onClick={onCancel}>
          {mode === 'edit' ? 'Cancel edit' : 'Discard'}
        </Button>
        <Button onClick={onSave} disabled={disabled || preconditionResult?.canExecute === false}>
          {mode === 'edit' ? 'Save in proposal' : 'Add to proposal'}
        </Button>
      </div>
    </section>
  );
}
