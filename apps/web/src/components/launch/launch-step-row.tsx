'use client';

import { AlertTriangle, Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { css } from 'styled-system/css';

import { Spinner } from '@/components/ui';
import type { StepStatus } from '@/lib/launch-steps';

const row = css({
  display: 'grid',
  gridTemplateColumns: 'auto minmax(0, 1fr)',
  columnGap: '3',
  rowGap: '3',
  py: '4',
  borderBottomWidth: '1px',
  borderColor: 'rule',
  _last: { borderBottomWidth: '0' }
});
const head = css({
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: '3',
  flexWrap: 'wrap'
});
const text = css({ display: 'grid', gap: '0.5', minW: '0' });
const title = css({ textStyle: 'body', fontWeight: '600', color: 'ink', m: '0' });
const detail = css({ textStyle: 'caption', color: 'ink.muted', m: '0' });
const caution = css({ textStyle: 'caption', color: 'warning', fontWeight: '600', m: '0' });
// Number and check share one slot; the check cross-fades in when the step is done.
const marker = css({
  position: 'relative',
  display: 'grid',
  placeItems: 'center',
  width: '7',
  height: '7',
  borderRadius: 'full',
  boxShadow: 'inset 0 0 0 1.5px token(colors.rule.strong)',
  color: 'ink.muted',
  textStyle: 'mono',
  fontSize: '0.8125rem',
  transitionProperty: 'background-color, box-shadow, color',
  transitionDuration: 'fast',
  '& > *': {
    gridArea: '1 / 1',
    transitionProperty: 'opacity, transform, filter',
    transitionDuration: '200ms',
    transitionTimingFunction: 'cubic-bezier(0.2, 0, 0, 1)'
  },
  '& [data-part=done]': { opacity: '0', transform: 'scale(0.25)', filter: 'blur(4px)' },
  '&[data-status=done]': { bg: 'signal', boxShadow: 'none', color: 'primary.fg' },
  '&[data-status=done] [data-part=done]': { opacity: '1', transform: 'scale(1)', filter: 'blur(0px)' },
  '&[data-status=done] [data-part=number]': { opacity: '0', transform: 'scale(0.25)', filter: 'blur(4px)' },
  '&[data-status=blocked]': { bg: 'warning', boxShadow: 'none', color: 'canvas' },
  '& svg': { width: '4', height: '4' },
  _motionReduce: { '& > *': { transitionProperty: 'opacity' } }
});

const STATUS_LABEL: Record<StepStatus, string> = {
  done: 'Done',
  todo: 'To do',
  blocked: 'Needs attention',
  loading: 'Checking'
};

/** One setup step: where it stands, what it means, and the one thing to do about it. */
export function LaunchStepRow({
  number,
  status,
  title: stepTitle,
  detail: stepDetail,
  caution: stepCaution,
  action,
  children
}: {
  /** Shown in the marker until done; omit for optional review rows. */
  number?: number;
  status: StepStatus;
  title: string;
  detail: string;
  caution?: string;
  action?: ReactNode;
  /** Inline content under the step, e.g. the rename form. */
  children?: ReactNode;
}) {
  return (
    <li className={row}>
      <span className={marker} data-status={status} aria-hidden="true">
        {status === 'blocked' ? (
          <AlertTriangle strokeWidth={2} />
        ) : status === 'loading' ? (
          <Spinner label="Checking" />
        ) : (
          <>
            <span data-part="number">{number ?? '·'}</span>
            <Check data-part="done" strokeWidth={2.5} />
          </>
        )}
      </span>
      <div className={css({ display: 'grid', gap: '3', minW: '0' })}>
        <div className={head}>
          <div className={text}>
            <h3 className={title}>
              {stepTitle}
              <span className="sr-only">: {STATUS_LABEL[status]}</span>
            </h3>
            <p className={detail}>{stepDetail}</p>
            {stepCaution ? <p className={caution}>{stepCaution}</p> : null}
          </div>
          {action}
        </div>
        {children}
      </div>
    </li>
  );
}
