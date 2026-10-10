import type { CSSProperties } from 'react';
import { css } from 'styled-system/css';

const track = css({ height: '1.5', borderRadius: 'full', bg: 'hover', overflow: 'hidden' });
// Grows by transform, so it never reflows; reduced motion just jumps.
const fill = css({
  height: '100%',
  width: '100%',
  borderRadius: 'full',
  bg: 'signal',
  transformOrigin: 'left',
  transform: 'scaleX(var(--progress))',
  transitionProperty: 'transform',
  transitionDuration: '300ms',
  transitionTimingFunction: 'out',
  _motionReduce: { transitionDuration: '0ms' }
});

/** A thin determinate progress bar. */
export function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <div
      className={track}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-label={label}
    >
      <div className={fill} style={{ '--progress': ratio } as CSSProperties} />
    </div>
  );
}
