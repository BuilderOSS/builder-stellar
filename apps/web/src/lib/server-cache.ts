/**
 * Process-local TTL cache with in-flight de-duplication for server reads that
 * are expensive (RPC) and change rarely. Concurrent callers share one pending
 * promise; failures are not cached. Per server instance only: never use it for
 * values that gate a signature (live checks happen when a transaction is
 * prepared).
 *
 * Bounded by count and by size: some values are large (a rendered token image,
 * a verified claim list), so a count alone does not bound the memory. When either
 * limit is passed, the oldest entries go first, and a single value larger than
 * maxValueBytes is returned without being kept.
 */
type Entry = { value?: unknown; expires: number; pending?: Promise<unknown>; bytes: number };

const DEFAULT_LIMITS = {
  maxEntries: 2_000,
  maxBytes: 128 * 1024 * 1024,
  maxValueBytes: 32 * 1024 * 1024
};

let limits = { ...DEFAULT_LIMITS };
const store = new Map<string, Entry>();
let totalBytes = 0;

/** A value whose size can't be measured (a client object with cycles) counts as this much. */
const UNMEASURED_BYTES = 16 * 1024;

/**
 * Roughly how much memory a value holds: the byte length of binary data, two bytes per character of
 * text, and twice the JSON length of anything else (an object holds more than its JSON text).
 */
export function estimateBytes(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (ArrayBuffer.isView(value)) return value.byteLength;
  if (value instanceof ArrayBuffer) return value.byteLength;
  if (typeof value === 'string') return value.length * 2;
  if (typeof value !== 'object') return 8;
  try {
    const json = JSON.stringify(value, (_key, item: unknown) => (typeof item === 'bigint' ? item.toString() : item));
    return json === undefined ? UNMEASURED_BYTES : json.length * 2;
  } catch {
    return UNMEASURED_BYTES;
  }
}

function remove(key: string) {
  const entry = store.get(key);
  if (!entry) return;
  totalBytes -= entry.bytes;
  store.delete(key);
}

function put(key: string, entry: Entry) {
  remove(key);
  store.set(key, entry);
  totalBytes += entry.bytes;
}

/** Drop the oldest insertions (Map preserves insertion order) until both limits hold. */
function evict(keep?: string) {
  if (store.size <= limits.maxEntries && totalBytes <= limits.maxBytes) return;
  // Past the count, drop a tenth at once, so the next few inserts don't each walk the map.
  const countTarget = store.size > limits.maxEntries ? Math.floor(limits.maxEntries * 0.9) : limits.maxEntries;
  for (const key of store.keys()) {
    if (store.size <= countTarget && totalBytes <= limits.maxBytes) break;
    if (key !== keep) remove(key);
  }
}

export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const entry = store.get(key);
  if (entry?.pending) return entry.pending as Promise<T>;
  if (entry && entry.expires > now && 'value' in entry) return entry.value as T;
  const pending = load().then(
    (value) => {
      const bytes = estimateBytes(value);
      if (bytes > limits.maxValueBytes) {
        // Too large to keep: every caller waiting on this load still gets it.
        remove(key);
      } else {
        put(key, { value, expires: Date.now() + ttlMs, bytes });
        evict(key);
      }
      return value;
    },
    (error: unknown) => {
      remove(key);
      throw error;
    }
  );
  put(key, { expires: now + ttlMs, pending, bytes: 0 });
  evict(key);
  return pending;
}

export function invalidateCached(prefix: string) {
  for (const key of [...store.keys()]) if (key.startsWith(prefix)) remove(key);
}

/** Test helper. */
export function clearServerCache() {
  store.clear();
  totalBytes = 0;
}

/** Test helper: entries held and their estimated bytes. */
export function serverCacheUsage() {
  return { entries: store.size, bytes: totalBytes };
}

/** Test helper: smaller limits for a test; call the returned function to restore the defaults. */
export function setServerCacheLimits(next: Partial<typeof DEFAULT_LIMITS>) {
  limits = { ...DEFAULT_LIMITS, ...next };
  return () => {
    limits = { ...DEFAULT_LIMITS };
  };
}
