export function formatDuration(seconds: number) {
  const totalSeconds = Math.max(0, Math.floor(Number(seconds)));
  if (!Number.isFinite(totalSeconds)) return '—';
  if (totalSeconds === 0) return '0 secs';

  const units = [
    { label: 'day', size: 86400 },
    { label: 'hr', size: 3600 },
    { label: 'min', size: 60 },
    { label: 'sec', size: 1 }
  ] as const;

  const parts: string[] = [];
  let remaining = totalSeconds;

  for (const unit of units) {
    const value = Math.floor(remaining / unit.size);
    if (value > 0) {
      parts.push(`${value} ${unit.label}${value === 1 ? '' : 's'}`);
      remaining %= unit.size;
    }
  }

  return parts.join(' ');
}
