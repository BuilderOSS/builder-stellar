import { css, cx } from 'styled-system/css';

const amount = css({ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' });
const unit = css({ color: 'ink.muted', fontWeight: '500', ml: '0.5ch' });

/**
 * An already-formatted amount with its unit ("2,400.5 XLM"). Formatting
 * stays with the domain helpers (stroops, SAC decimals); this keeps the look
 * consistent: tabular figures, muted unit, never wraps.
 */
export function Amount({ value, unit: unitLabel, className }: { value: string; unit?: string; className?: string }) {
  return (
    <span className={cx(amount, className)}>
      {value}
      {unitLabel ? <span className={unit}>{unitLabel}</span> : null}
    </span>
  );
}
