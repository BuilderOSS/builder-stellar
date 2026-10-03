/**
 * Format duration in seconds to human-readable format
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = seconds / 60;
  if (minutes < 60) {
    return `${Math.round(minutes)}m`;
  }

  const hours = minutes / 60;
  if (hours < 24) {
    return `${Math.round(hours)}h`;
  }

  const days = hours / 24;
  return `${Math.round(days)}d`;
}

/**
 * Format seconds to detailed format (e.g., "1 day, 2 hours")
 */
export function formatDurationDetailed(seconds: number): string {
  const parts: string[] = [];

  const days = Math.floor(seconds / 86400);
  if (days > 0) parts.push(`${days} day${days > 1 ? 's' : ''}`);

  const hours = Math.floor((seconds % 86400) / 3600);
  if (hours > 0) parts.push(`${hours} hour${hours > 1 ? 's' : ''}`);

  const minutes = Math.floor((seconds % 3600) / 60);
  if (minutes > 0) parts.push(`${minutes} minute${minutes > 1 ? 's' : ''}`);

  if (parts.length === 0) return `${seconds}s`;
  if (parts.length === 1) return parts[0];

  return parts.slice(0, -1).join(', ') + ` and ${parts[parts.length - 1]}`;
}
