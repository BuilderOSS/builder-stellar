'use client';
import type { ComponentProps } from 'react';
import { css } from 'styled-system/css';
import { input } from 'styled-system/recipes';

const wrap = css({ position: 'relative' });
const field = css({ pr: '10', fontVariantNumeric: 'tabular-nums' });
const unit = css({
  position: 'absolute',
  right: '3.5',
  top: '50%',
  translate: '0 -50%',
  textStyle: 'label',
  color: 'ink.muted',
  pointerEvents: 'none'
});

/** Percent entry stored as basis points (1% = 100 bps). */
export function PercentField({
  bps,
  onChange,
  ...props
}: Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'type'> & { bps: number; onChange: (bps: number) => void }) {
  return (
    <div className={wrap}>
      <input
        type="number"
        inputMode="decimal"
        min={0.01}
        max={100}
        step={0.01}
        className={`${input()} ${field}`}
        value={Number.isFinite(bps) ? bps / 100 : ''}
        onChange={(event) => onChange(Math.round(event.target.valueAsNumber * 100))}
        {...props}
      />
      <span className={unit} aria-hidden="true">
        %
      </span>
    </div>
  );
}
