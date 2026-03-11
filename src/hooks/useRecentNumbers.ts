import { useState, useCallback } from "react";

export interface RecentNumber {
  number: string;
  name?: string;
  lastUsed: number;
}

const MAX_RECENT = 5;
const STORAGE_KEY_PREFIX = "inkota_recent_";

function getStorageKey(serviceType: string) {
  return `${STORAGE_KEY_PREFIX}${serviceType}`;
}

function loadRecent(serviceType: string): RecentNumber[] {
  try {
    const raw = localStorage.getItem(getStorageKey(serviceType));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRecent(serviceType: string, numbers: RecentNumber[]) {
  localStorage.setItem(getStorageKey(serviceType), JSON.stringify(numbers));
}

export function useRecentNumbers(serviceType: string) {
  const [recentNumbers, setRecentNumbers] = useState<RecentNumber[]>(() =>
    loadRecent(serviceType)
  );

  const addRecentNumber = useCallback(
    (number: string, name?: string) => {
      const trimmed = number.trim();
      if (!trimmed) return;

      setRecentNumbers((prev) => {
        const filtered = prev.filter((r) => r.number !== trimmed);
        const updated = [
          { number: trimmed, name: name || undefined, lastUsed: Date.now() },
          ...filtered,
        ].slice(0, MAX_RECENT);
        saveRecent(serviceType, updated);
        return updated;
      });
    },
    [serviceType]
  );

  const clearRecentNumbers = useCallback(() => {
    localStorage.removeItem(getStorageKey(serviceType));
    setRecentNumbers([]);
  }, [serviceType]);

  return { recentNumbers, addRecentNumber, clearRecentNumbers };
}
