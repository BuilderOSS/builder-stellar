'use client';

import { Button, Callout } from '@/components/ui';

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Callout variant="error" title="Unable to load this DAO">
      <Button onClick={reset}>Try again</Button>
    </Callout>
  );
}
