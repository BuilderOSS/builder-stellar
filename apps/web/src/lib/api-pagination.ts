export function parseNonNegativeInteger(value: string | null, fallback: number) {
  if (value === null || !/^\d+$/.test(value)) return fallback;

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : fallback;
}

export function parseLimit(value: string | null, fallback: number, maximum = 100) {
  const parsed = parseNonNegativeInteger(value, fallback);
  return parsed === 0 ? fallback : Math.min(parsed, maximum);
}

/** Deepest page a list endpoint serves: an OFFSET scan past this is a denial-of-service lever, not paging. */
export const MAX_OFFSET = 100_000;

export function parseOffset(value: string | null) {
  return Math.min(parseNonNegativeInteger(value, 0), MAX_OFFSET);
}

/** A comma-separated filter list, trimmed, de-duplicated and capped. */
export function parseList(value: string | null | undefined, maximum = 20): string[] {
  if (!value) return [];
  return [
    ...new Set(
      value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    )
  ].slice(0, maximum);
}
