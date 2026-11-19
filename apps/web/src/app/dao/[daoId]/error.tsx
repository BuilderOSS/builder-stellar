'use client';

import { RouteError } from '@/components/route-error';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError error={error} reset={reset} title="This page didn't load" homeLabel="Go to Tribe Builder home" />;
}
