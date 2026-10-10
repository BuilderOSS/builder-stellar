'use client';

import { type ComponentProps, forwardRef } from 'react';
import { css, cx } from 'styled-system/css';
import { input } from 'styled-system/recipes';

const wrap = css({ position: 'relative', width: '100%' });
const field = css({ pr: '16', fontVariantNumeric: 'tabular-nums', fontSize: '1.0625rem', fontWeight: '600' });
const unit = css({
  position: 'absolute',
  right: '3.5',
  top: '50%',
  translate: '0 -50%',
  textStyle: 'label',
  color: 'ink.muted',
  pointerEvents: 'none'
});

/** Decimal amount with its asset shown inside the field. */
export const AmountInput = forwardRef<HTMLInputElement, Omit<ComponentProps<'input'>, 'type'> & { unit: string }>(
  function AmountInput({ unit: unitLabel, className, ...props }, ref) {
    return (
      <div className={wrap}>
        <input
          ref={ref}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          className={cx(input(), field, className)}
          {...props}
        />
        <span className={unit} aria-hidden="true">
          {unitLabel}
        </span>
      </div>
    );
  }
);
