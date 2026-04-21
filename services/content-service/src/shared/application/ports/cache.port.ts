export const CACHE_SERVICE = Symbol('CACHE_SERVICE');

export interface ICacheService {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<void>;
  // Uses SCAN + batch DEL — never KEYS, safe for production Redis.
  deleteByPattern(pattern: string): Promise<number>;
}
