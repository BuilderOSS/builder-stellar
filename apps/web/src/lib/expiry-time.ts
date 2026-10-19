/**
 * A closing time typed in a `datetime-local` input is local wall-clock time. Queued actions keep
 * it as unix seconds, so a draft means the same moment in any time zone it is reopened in.
 */

/** Unix seconds from a datetime-local string (read in this browser's zone) or digits already in seconds. */
export function expiryToUnixSeconds(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) return Number.isSafeInteger(Number(trimmed)) ? Number(trimmed) : null;
  const ms = new Date(trimmed).getTime();
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

/** What a datetime-local input shows for a stored value: seconds as local time, anything else as is. */
export function expiryInputValue(value: string): string {
  if (!/^\d+$/.test(value.trim())) return value;
  const date = new Date(Number(value.trim()) * 1000);
  if (!Number.isFinite(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
