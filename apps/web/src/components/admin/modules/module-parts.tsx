'use client';

import { Check, LoaderCircle, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { css } from 'styled-system/css';
import useSWR from 'swr';

import { Address } from '@/components/ui';
import { formatDuration } from '@/lib/duration';
import type { PlanStep } from '@/lib/modules/plans';

const plan = css({ listStyle: 'none', m: '0', p: '0', display: 'grid' });
const step = css({
  display: 'grid',
  gridTemplateColumns: '24px 1fr',
  gap: '2.5',
  py: '2.5',
  borderBottomWidth: '1px',
  borderColor: 'rule',
  _last: { borderBottomWidth: '0' }
});
const number = css({
  textStyle: 'caption',
  fontFamily: 'mono',
  color: 'ink.muted',
  pt: '0.5',
  fontVariantNumeric: 'tabular-nums'
});
const stepTitle = css({ textStyle: 'body', fontWeight: '600', color: 'ink' });
const stepDetail = css({
  textStyle: 'caption',
  color: 'ink.muted',
  mt: '0.5',
  display: 'grid',
  gap: '1',
  justifyItems: 'start'
});

/** "When this passes, in order": the plain steps, numbered, with any contract a step names. */
export function PlanList({ steps, label }: { steps: PlanStep[]; label: string }) {
  return (
    <ol className={plan} aria-label={label}>
      {steps.map((entry, index) => (
        <li key={`${entry.type}:${index}`} className={step}>
          <span className={number}>{index + 1}</span>
          <div>
            <div className={stepTitle}>{entry.title}</div>
            <div className={stepDetail}>
              <span>{entry.detail}</span>
              {entry.address ? <Address value={entry.address} compact /> : null}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

export type CheckState =
  | { state: 'checking'; message?: string }
  | { state: 'ok'; message: string; detail?: string }
  | { state: 'fail'; message: string; detail?: string };

const checkLine = css({ display: 'flex', alignItems: 'flex-start', gap: '2.5', minH: '6', textStyle: 'body' });
// The three icons share one box and swap with scale, opacity and blur (never the words alone).
const swap = css({
  position: 'relative',
  width: '5',
  height: '5',
  flexShrink: '0',
  mt: '0.5',
  '& > svg': {
    position: 'absolute',
    inset: '0',
    width: '5',
    height: '5',
    opacity: '0',
    scale: '0.25',
    filter: 'blur(4px)',
    transitionProperty: 'opacity, scale, filter',
    transitionDuration: '160ms',
    transitionTimingFunction: 'cubic-bezier(0.2, 0, 0, 1)'
  },
  '&[data-state=checking] > .check-spin, &[data-state=ok] > .check-ok, &[data-state=fail] > .check-bad': {
    opacity: '1',
    scale: '1',
    filter: 'blur(0)'
  },
  '& > .check-spin': { animation: 'spin 900ms linear infinite', color: 'ink.muted' },
  '& > .check-ok': { color: 'success' },
  '& > .check-bad': { color: 'danger' },
  '@media (prefers-reduced-motion: reduce)': {
    '& > svg': { scale: '1', filter: 'none', transitionProperty: 'opacity', transitionDuration: '150ms' },
    '& > .check-spin': { animation: 'none' }
  }
});
const words = css({ display: 'grid', gap: '0.5', minW: '0' });
const sub = css({ textStyle: 'caption', color: 'ink.muted' });

/** The check's result, announced politely. Its words change with its icon. */
export function ModuleCheck({ value }: { value: CheckState }): ReactNode {
  const text = value.state === 'checking' ? (value.message ?? 'Checking against the chain…') : value.message;
  const detail = value.state === 'checking' ? undefined : value.detail;
  return (
    <div className={checkLine} role="status" aria-live="polite">
      <span className={swap} data-state={value.state} aria-hidden="true">
        <LoaderCircle className="check-spin" />
        <Check className="check-ok" />
        <TriangleAlert className="check-bad" />
      </span>
      <span className={words}>
        <span>{text}</span>
        {detail ? <span className={sub}>{detail}</span> : null}
      </span>
    </div>
  );
}

/** The tribe's safety delay in seconds, from the index; null when it could not be read. */
export function useSafetyDelay(daoId: string) {
  const { data } = useSWR(
    ['safety-delay', daoId],
    async () => {
      const response = await fetch(`/api/dao/${encodeURIComponent(daoId)}/governance/settings`, { cache: 'no-store' });
      if (!response.ok) return null;
      const body = (await response.json()) as { settings?: { queueDelay?: number | null } | null };
      return body.settings?.queueDelay ?? null;
    },
    { revalidateOnFocus: false, shouldRetryOnError: false }
  );
  return data ?? null;
}

/** "After the vote, and a safety delay of 5 minutes." */
export function afterTheVote(seconds: number | null) {
  return seconds
    ? `After the vote, and a safety delay of ${formatDuration(seconds, { style: 'long' })}.`
    : 'After the vote and the safety delay.';
}
