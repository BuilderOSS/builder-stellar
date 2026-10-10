'use client';

import { useEffect, useState } from 'react';
import { css, cx } from 'styled-system/css';

import { formatCountdown } from '@/lib/duration';

const countdown = css({ fontVariantNumeric: 'tabular-nums' });

/**
 * Ticking countdown to a unix timestamp (seconds). Renders `endedLabel` once
 * the time has passed. Updates once a second while under an hour, else once a
 * minute.
 */
export function Countdown({
  endsAt,
  endedLabel = 'Ended',
  className
}: {
  endsAt: number;
  endedLabel?: string;
  className?: string;
}) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const remaining = Math.max(0, endsAt - now);

  useEffect(() => {
    if (remaining <= 0) return;
    const interval = remaining < 3600 ? 1000 : 30_000;
    const id = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), interval);
    return () => window.clearInterval(id);
  }, [remaining]);

  return (
    <time
      className={cx(countdown, className)}
      dateTime={new Date(endsAt * 1000).toISOString()}
      suppressHydrationWarning
    >
      {remaining > 0 ? formatCountdown(remaining) : endedLabel}
    </time>
  );
}
