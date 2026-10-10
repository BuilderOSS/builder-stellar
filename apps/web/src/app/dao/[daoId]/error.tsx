'use client';

import { Button, ButtonLink, ErrorState } from '@/components/ui';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorState
      title="This part of the community didn't load"
      cause={error.message ? `${error.message}${error.digest ? ` (ref ${error.digest})` : ''}` : undefined}
      actions={
        <>
          <Button variant="secondary" onClick={reset}>
            Try again
          </Button>
          <ButtonLink href="/" variant="ghost">
            Go to Builder home
          </ButtonLink>
        </>
      }
    />
  );
}
