'use client';

import { css } from 'styled-system/css';

import { RouteError } from '@/components/route-error';

const wrap = css({ maxW: 'content', mx: 'auto', px: 'clamp(16px, 4vw, 40px)', py: '10' });

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className={wrap}>
      <RouteError error={error} reset={reset} title="Something went wrong" homeLabel="Go home" />
    </div>
  );
}
