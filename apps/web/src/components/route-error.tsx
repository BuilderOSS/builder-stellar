'use client';

import { useEffect, useState } from 'react';

import { Button, ButtonLink, Callout, ErrorState } from '@/components/ui';
import { canAutoReload, isChunkLoadError, reloadForChunkError } from '@/lib/chunk-reload';

/**
 * Error boundary body. A stale tab after a deploy reloads itself once;
 * anything else shows the cause with retry and a way home.
 */
export function RouteError({
  error,
  reset,
  title,
  homeLabel
}: {
  error: Error & { digest?: string };
  reset: () => void;
  title: string;
  homeLabel: string;
}) {
  const stale = isChunkLoadError(error);
  // Decided once per boundary mount, so a failed reload falls back to the button.
  const [reloading] = useState(() => stale && canAutoReload());

  useEffect(() => {
    if (reloading) reloadForChunkError();
  }, [reloading]);

  if (stale) {
    return (
      // Not a failure: a newer version is live. Info, not error styling.
      <Callout
        title="Builder was updated"
        description={reloading ? 'Loading the latest version…' : 'Reload to continue with the latest version.'}
      >
        <div>
          <Button loading={reloading} onClick={() => reloadForChunkError()}>
            Reload
          </Button>
        </div>
      </Callout>
    );
  }

  return (
    <ErrorState
      title={title}
      cause={error.message ? `${error.message}${error.digest ? ` (ref ${error.digest})` : ''}` : undefined}
      actions={
        <>
          <Button variant="secondary" onClick={reset}>
            Try again
          </Button>
          <ButtonLink href="/" variant="ghost">
            {homeLabel}
          </ButtonLink>
        </>
      }
    />
  );
}
