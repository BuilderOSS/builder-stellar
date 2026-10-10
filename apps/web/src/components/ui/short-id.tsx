'use client';

import { Address } from './address';

/** @deprecated Use `Address`. Kept while screens migrate. */
export function ShortId(props: { value: string; label?: string; explorerUrl?: string; compact?: boolean }) {
  return <Address {...props} copyLabel="Copy address" />;
}
