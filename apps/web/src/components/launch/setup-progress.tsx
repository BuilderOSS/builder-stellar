import { css } from 'styled-system/css';

import { ProgressBar } from '@/components/ui';

const label = css({ textStyle: 'label', color: 'ink', m: '0' });

/** "1 of 2 required steps done" with a thin bar. */
export function SetupProgress({ done, total }: { done: number; total: number }) {
  return (
    <div className={css({ display: 'grid', gap: '2' })}>
      <p className={label}>{done === total ? 'All required steps done' : `${done} of ${total} required steps done`}</p>
      <ProgressBar value={done} max={total} label="Setup progress" />
    </div>
  );
}
