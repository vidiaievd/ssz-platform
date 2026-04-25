import { Injectable, Logger } from '@nestjs/common';
import type { ICacheService } from '../../shared/application/ports/cache.port.js';
import { RedisService } from './redis.service.js';

const SCAN_BATCH_SIZE = 100;

@Injectable()
export class RedisCacheService implements ICacheService {
  private readonly logger = new Logger(RedisCacheService.name);

  constructor(private readonly redis: RedisService) {}

  async get<T>(key: string): Promise<T | null> {
    const client = this.redis.getClient();
    if (!client) return null;

    const raw = await client.get(key);
    if (raw === null) return null;

    try {
      return JSON.parse(raw) as T;
    } catch {
      this.logger.warn(`Failed to parse cached value for key "${key}"`);
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const client = this.redis.getClient();
    if (!client) return;

    const serialized = JSON.stringify(value);
    if (ttlSeconds != null && ttlSeconds > 0) {
      await client.set(key, serialized, 'EX', ttlSeconds);
    } else {
      await client.set(key, serialized);
    }
  }

  async delete(key: string): Promise<void> {
    const client = this.redis.getClient();
    if (!client) return;
    await client.del(key);
  }

  async deleteByPattern(pattern: string): Promise<number> {
    const client = this.redis.getClient();
    if (!client) return 0;

    let cursor = '0';
    let totalDeleted = 0;

    do {
      const [nextCursor, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', SCAN_BATCH_SIZE);
      cursor = nextCursor;
      if (keys.length > 0) {
        await client.del(...keys);
        totalDeleted += keys.length;
      }
    } while (cursor !== '0');

    return totalDeleted;
  }
}
