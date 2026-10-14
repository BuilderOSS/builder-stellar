'use client';

import { Check, Circle, LoaderCircle, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { css, cx } from 'styled-system/css';

export type StepState = 'idle' | 'active' | 'done' | 'error';
export type PublishStep = { id: string; label: string; state: StepState; detail?: ReactNode };

const list = css({ display: 'grid', gap: '3', listStyle: 'none', m: '0', p: '0' });
const row = css({ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', gap: '3', alignItems: 'start' });
const marker = css({ display: 'grid', width: '5', height: '5', mt: '0.5', '& > svg': { gridArea: '1 / 1' } });
// Every state's icon stays mounted and cross-fades, so a step finishing never pops.
const icon = css({
  width: '5',
  height: '5',
  opacity: '0',
  transform: 'scale(0.25)',
  filter: 'blur(4px)',
  transitionProperty: 'opacity, transform, filter',
  transitionDuration: '200ms',
  transitionTimingFunction: 'cubic-bezier(0.2, 0, 0, 1)',
  _motionReduce: { transitionProperty: 'opacity', transform: 'none', filter: 'none' }
});
const shown = { opacity: '1', transform: 'scale(1)', filter: 'blur(0px)' };
const idle = css({ color: 'ink.faint', '[data-state=idle] > &': shown });
const active = css({
  color: 'signal',
  '[data-state=active] > &': { ...shown, animation: 'spin 0.9s linear infinite' },
  _motionReduce: { animationDuration: '2.4s' }
});
const done = css({ color: 'signal', '[data-state=done] > &': shown });
const failed = css({ color: 'danger', '[data-state=error] > &': shown });
const label = css({
  textStyle: 'label',
  color: 'ink.muted',
  m: '0',
  '[data-state=active] &, [data-state=done] &': { color: 'ink' },
  '[data-state=error] &': { color: 'danger' }
});
const detail = css({ textStyle: 'caption', color: 'ink.muted', m: '0', mt: '0.5', overflowWrap: 'anywhere' });

/** Publishing a claim list, step by step, so a slow upload or a failed signature says where it stopped. */
export function ClaimPublishSteps({ steps }: { steps: PublishStep[] }) {
  return (
    <ol className={list} aria-label="Publishing the claim list">
      {steps.map((step) => (
        <li key={step.id} className={row} data-state={step.state}>
          <span className={marker} data-state={step.state} aria-hidden="true">
            <Circle className={cx(icon, idle)} />
            <LoaderCircle className={cx(icon, active)} />
            <Check className={cx(icon, done)} strokeWidth={2.5} />
            <TriangleAlert className={cx(icon, failed)} />
          </span>
          <div>
            <p className={label}>
              {step.label}
              <span className="sr-only">
                {step.state === 'done'
                  ? ' (done)'
                  : step.state === 'active'
                    ? ' (in progress)'
                    : step.state === 'error'
                      ? ' (stopped)'
                      : ''}
              </span>
            </p>
            {step.detail ? <div className={detail}>{step.detail}</div> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
