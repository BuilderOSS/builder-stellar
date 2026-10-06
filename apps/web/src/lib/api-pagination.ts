export function parseNonNegativeInteger(value: string | null, fallback: number) {
  if (value === null || !/^\d+$/.test(value)) return fallback;

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : fallback;
}

export function parseLimit(value: string | null, fallback: number, maximum = 100) {
  const parsed = parseNonNegativeInteger(value, fallback);
  return parsed === 0 ? fallback : Math.min(parsed, maximum);
}
