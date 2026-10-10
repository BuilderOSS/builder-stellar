import type { HTMLAttributes } from 'react';
import { css, cx } from 'styled-system/css';

const skeleton = css({
  display: 'block',
  minH: '1em',
  borderRadius: 'sm',
  bg: 'skeleton',
  animation: 'pulse 1.6s ease-in-out infinite',
  '@media (prefers-reduced-motion: reduce)': { animation: 'none' }
});

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span aria-hidden="true" className={cx(skeleton, className)} {...props} />;
}
