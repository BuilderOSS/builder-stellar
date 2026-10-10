'use client';

import { useEffect, useState } from 'react';

/** Current unix time in seconds, updated on an interval. Null until mounted (SSR-safe). */
export function useNow(intervalMs = 30_000): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const update = () => setNow(Math.floor(Date.now() / 1000));
    update();
    const id = window.setInterval(update, intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
