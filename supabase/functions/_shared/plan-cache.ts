// In-memory cache for provider data plans
// TTL: 5 minutes

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();
const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

export function setCache<T>(key: string, data: T, ttlMs: number = DEFAULT_TTL_MS): void {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

export function invalidateCache(keyPrefix?: string): void {
  if (!keyPrefix) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(keyPrefix)) cache.delete(key);
  }
}
