'use client';

import { useEffect, useState } from 'react';

/** A far deadline is re-checked at least this often. */
const MAX_WAIT_MS = 60 * 60 * 1000;

/**
 * How long to wait before reading the clock again: until just past the deadline, capped so a far
 * deadline is re-checked (setTimeout misfires above ~24.8 days). Null once it has passed, or without one.
 */
export function deadlineWaitMs(deadline: number | null, nowSeconds: number): number | null {
  if (deadline === null || nowSeconds > deadline) return null;
  return Math.min((deadline - nowSeconds) * 1000 + 1000, MAX_WAIT_MS);
}

/**
 * Unix seconds, read once when the component mounts (so the first render, server or client, can
 * already tell a past deadline) and read again once `deadline` passes, so a page left open across it
 * flips without a reload. Ticks only toward the deadline, never on a fixed interval.
 */
export function useDeadlineClock(deadline: number | null): number {
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    const wait = deadlineWaitMs(deadline, now);
    if (wait === null) return;
    const id = window.setTimeout(() => setNow(Date.now() / 1000), wait);
    return () => window.clearTimeout(id);
  }, [deadline, now]);
  return now;
}
