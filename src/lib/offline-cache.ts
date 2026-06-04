/**
 * Lightweight namespaced localStorage cache for offline support.
 * Keys are scoped per user so multi-account devices don't leak data.
 */

const PREFIX = "inkota_cache_v1";

const key = (userId: string | null | undefined, name: string) =>
  `${PREFIX}:${userId || "anon"}:${name}`;

export function readCache<T>(userId: string | null | undefined, name: string): T | null {
  try {
    const raw = localStorage.getItem(key(userId, name));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { data: T; ts: number };
    return parsed.data;
  } catch {
    return null;
  }
}

export function writeCache<T>(userId: string | null | undefined, name: string, data: T): void {
  try {
    localStorage.setItem(
      key(userId, name),
      JSON.stringify({ data, ts: Date.now() })
    );
  } catch {
    // quota or serialization issues — ignore
  }
}

export function readCacheMeta(userId: string | null | undefined, name: string): number | null {
  try {
    const raw = localStorage.getItem(key(userId, name));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { data: unknown; ts: number };
    return parsed.ts ?? null;
  } catch {
    return null;
  }
}
