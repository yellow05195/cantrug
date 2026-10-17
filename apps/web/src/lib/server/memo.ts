/**
 * Small in-process memo with a freshness TTL and a stale window: a fresh value
 * is returned as is; a stale one is returned at once while a refresh runs in the
 * background; after the stale window the caller waits. Concurrent callers share
 * one in-flight promise. On Vercel each function instance has its own memo; the
 * route handlers add `s-maxage` headers so the CDN shares results across them.
 */
interface Entry {
  at: number;
  value: unknown;
  inflight: Promise<unknown> | null;
}

const store = new Map<string, Entry>();
const MAX_ENTRIES = 2000;

export async function memo<T>(key: string, fn: () => Promise<T>, opts: { fresh: number; stale?: number }): Promise<T> {
  const now = Date.now();
  const e = store.get(key);
  const staleMs = opts.stale ?? opts.fresh * 6;
  if (e && e.value !== undefined) {
    const age = now - e.at;
    if (age < opts.fresh) return e.value as T;
    if (age < opts.fresh + staleMs) {
      if (!e.inflight) e.inflight = run(key, fn, e);
      return e.value as T;
    }
  }
  if (e?.inflight) return e.inflight as Promise<T>;
  const entry: Entry = e ?? { at: 0, value: undefined, inflight: null };
  if (!e) {
    if (store.size >= MAX_ENTRIES) store.delete(store.keys().next().value as string);
    store.set(key, entry);
  }
  entry.inflight = run(key, fn, entry);
  return entry.inflight as Promise<T>;
}

async function run<T>(key: string, fn: () => Promise<T>, entry: Entry): Promise<T> {
  try {
    const v = await fn();
    entry.value = v;
    entry.at = Date.now();
    return v;
  } catch (err) {
    // Keep serving the last good value when the RPC hiccups.
    if (entry.value !== undefined) return entry.value as T;
    store.delete(key);
    throw err;
  } finally {
    entry.inflight = null;
  }
}

/** Memo keyed by a bounded LRU of `max` keys (per-coin caches). */
export function peek<T>(key: string): T | undefined {
  return store.get(key)?.value as T | undefined;
}
