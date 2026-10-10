'use client';

import { css } from 'styled-system/css';

import { Button, ButtonLink, ErrorState } from '@/components/ui';

const wrap = css({ maxW: 'content', mx: 'auto', px: 'clamp(16px, 4vw, 40px)', py: '10' });

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className={wrap}>
      <ErrorState
        title="Something went wrong"
        cause={error.message ? `${error.message}${error.digest ? ` (ref ${error.digest})` : ''}` : undefined}
        actions={
          <>
            <Button variant="secondary" onClick={reset}>
              Try again
            </Button>
            <ButtonLink href="/" variant="ghost">
              Go home
            </ButtonLink>
          </>
        }
      />
    </div>
  );
}
