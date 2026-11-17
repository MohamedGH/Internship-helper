export interface CacheEntry<T> {
  readonly value: T;
  readonly expiresAt: number;
}

export interface TtlCache<T> {
  readonly get: (key: string) => T | undefined;
  readonly set: (key: string, value: T, ttlMs?: number) => void;
  readonly has: (key: string) => boolean;
  readonly delete: (key: string) => void;
  readonly clear: () => void;
}

export const createTtlCache = <T>(defaultTtlMs = 5 * 60 * 1000): TtlCache<T> => {
  const store = new Map<string, CacheEntry<T>>();

  const get = (key: string): T | undefined => {
    const entry = store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      store.delete(key);
      return undefined;
    }
    return entry.value;
  };

  const set = (key: string, value: T, ttlMs = defaultTtlMs): void => {
    store.set(key, {
      value,
      expiresAt: Date.now() + Math.max(0, ttlMs),
    });
  };

  const has = (key: string): boolean => get(key) !== undefined;
  const del = (key: string): void => {
    store.delete(key);
  };
  const clear = (): void => {
    store.clear();
  };

  return { get, set, has, delete: del, clear };
};
