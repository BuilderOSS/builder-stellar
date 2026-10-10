/**
 * Process-local TTL cache with in-flight de-duplication for server reads that
 * are expensive (RPC) and change rarely. Concurrent callers share one pending
 * promise; failures are not cached. Per server instance only: never use it for
 * values that gate a signature (live checks happen when a transaction is
 * prepared).
 */
type Entry = { value?: unknown; expires: number; pending?: Promise<unknown> };

const store = new Map<string, Entry>();
const MAX_ENTRIES = 2_000;

export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const entry = store.get(key);
  if (entry?.pending) return entry.pending as Promise<T>;
  if (entry && entry.expires > now && 'value' in entry) return entry.value as T;
  const pending = load().then(
    (value) => {
      store.set(key, { value, expires: Date.now() + ttlMs });
      return value;
    },
    (error: unknown) => {
      store.delete(key);
      throw error;
    }
  );
  store.set(key, { expires: now + ttlMs, pending });
  if (store.size > MAX_ENTRIES) {
    // Drop the oldest insertions (Map preserves insertion order).
    for (const old of store.keys()) {
      if (store.size <= MAX_ENTRIES * 0.9) break;
      store.delete(old);
    }
  }
  return pending;
}

export function invalidateCached(prefix: string) {
  for (const key of store.keys()) if (key.startsWith(prefix)) store.delete(key);
}

/** Test helper. */
export function clearServerCache() {
  store.clear();
}
