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
