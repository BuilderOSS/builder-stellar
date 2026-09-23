import type { HTMLAttributes } from 'react';

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span aria-hidden="true" className={['skeleton', className].filter(Boolean).join(' ')} {...props} />;
}
