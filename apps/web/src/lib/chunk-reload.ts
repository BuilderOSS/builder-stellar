// A tab opened before a deploy asks for script chunks the new deploy no longer
// serves. A full reload picks up the current build; the guard stops a loop if
// the chunk is genuinely missing.

const RELOAD_KEY = 'builder:chunk-reload-at';
const RELOAD_WINDOW_MS = 30_000;

export function isChunkLoadError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { name, message } = error as { name?: unknown; message?: unknown };
  if (name === 'ChunkLoadError') return true;
  if (typeof message !== 'string') return false;
  return (
    /Loading (CSS )?chunk [\w-]+ failed/i.test(message) ||
    /Failed to fetch dynamically imported module/i.test(message) ||
    /error loading dynamically imported module/i.test(message) ||
    /Importing a module script failed/i.test(message)
  );
}

/** False when a chunk reload already happened moments ago: show a manual prompt instead of looping. */
export function canAutoReload(now = Date.now()): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return now - Number(window.sessionStorage.getItem(RELOAD_KEY) ?? 0) >= RELOAD_WINDOW_MS;
  } catch {
    // Storage blocked: allow it; the browser stops a tight reload loop itself.
    return true;
  }
}

/** Hard reload to pick up the current deploy, remembering when so canAutoReload can stop a loop. */
export function reloadForChunkError(now = Date.now()) {
  try {
    window.sessionStorage.setItem(RELOAD_KEY, String(now));
  } catch {
    // Storage blocked; reload anyway.
  }
  window.location.reload();
}
