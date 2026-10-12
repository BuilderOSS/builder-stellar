'use client';

import { RouteError } from '@/components/route-error';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <RouteError
      error={error}
      reset={reset}
      title="This part of the community didn't load"
      homeLabel="Go to Builder home"
    />
  );
}
