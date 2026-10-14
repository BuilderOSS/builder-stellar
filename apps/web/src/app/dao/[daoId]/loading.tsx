import { css } from 'styled-system/css';

import { Skeleton } from '@/components/ui';

// minmax(0, 1fr): the fixed-width bars shrink to a phone-width column instead of widening the grid.
const wrap = css({ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '4' });

export default function Loading() {
  return (
    <div className={wrap} role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading</span>
      <Skeleton className={css({ width: '56', height: '9' })} />
      <Skeleton className={css({ width: '80', maxW: '100%', height: '4' })} />
      <Skeleton className={css({ height: '44', borderRadius: 'sheet' })} />
      <Skeleton className={css({ height: '14' })} />
      <Skeleton className={css({ height: '14' })} />
    </div>
  );
}
