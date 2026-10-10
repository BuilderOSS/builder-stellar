export type DurationParts = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
};

function normalizePart(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

export function splitDuration(totalSeconds: number): DurationParts {
  const seconds = normalizePart(totalSeconds);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  return { days, hours, minutes, seconds: remainingSeconds };
}

export function combineDuration(parts: DurationParts) {
  return (
    normalizePart(parts.days) * 86400 +
    normalizePart(parts.hours) * 3600 +
    normalizePart(parts.minutes) * 60 +
    normalizePart(parts.seconds)
  );
}

export function clampDurationParts(parts: DurationParts): DurationParts {
  return {
    days: normalizePart(parts.days),
    hours: Math.min(23, normalizePart(parts.hours)),
    minutes: Math.min(59, normalizePart(parts.minutes)),
    seconds: Math.min(59, normalizePart(parts.seconds))
  };
}

const UNITS = [
  { short: 'd', long: 'day', size: 86400 },
  { short: 'h', long: 'hour', size: 3600 },
  { short: 'm', long: 'minute', size: 60 },
  { short: 's', long: 'second', size: 1 }
] as const;

/**
 * Human duration for settings and summaries: "2d 4h", "45m", "30s".
 * `long` spells units out ("2 days 4 hours"). At most `maxUnits` units.
 */
export function formatDuration(
  totalSeconds: number,
  { style = 'short', maxUnits = 2 }: { style?: 'short' | 'long'; maxUnits?: number } = {}
): string {
  if (!Number.isFinite(totalSeconds)) return '—';
  let remaining = normalizePart(totalSeconds);
  if (remaining === 0) return style === 'long' ? '0 seconds' : '0s';

  const parts: string[] = [];
  for (const unit of UNITS) {
    if (parts.length >= maxUnits) break;
    const value = Math.floor(remaining / unit.size);
    if (value > 0) {
      parts.push(style === 'long' ? `${value} ${unit.long}${value === 1 ? '' : 's'}` : `${value}${unit.short}`);
      remaining %= unit.size;
    }
  }
  return parts.join(' ');
}

/** Live countdown text: "2d 4h", "4h 12m", "12m 05s", "45s". */
export function formatCountdown(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds)) return '—';
  const { days, hours, minutes, seconds } = splitDuration(totalSeconds);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  return `${seconds}s`;
}
