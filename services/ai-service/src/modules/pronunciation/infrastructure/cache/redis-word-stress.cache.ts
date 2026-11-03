import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../../../infrastructure/cache/redis.service.js';
import type { CachedWordStresses, IWordStressCache } from '../../application/ports/word-stress.cache.js';

// The client adds the `ai:` prefix: `ai:prosody:words:<key>`.
const NAMESPACE = 'prosody:words:';
const TTL_SECONDS = 7 * 24 * 3600;

/** Fails open like the rest of Redis here: away, every read is a miss and every write is skipped. */
@Injectable()
export class RedisWordStressCache implements IWordStressCache {
  private readonly logger = new Logger(RedisWordStressCache.name);

  constructor(private readonly redis: RedisService) {}

  async get(key: string): Promise<CachedWordStresses | null> {
    const client = this.redis.getClient();
    if (!client || !this.redis.isReady()) return null;
    try {
      const raw = await client.get(NAMESPACE + key);
      return raw ? (JSON.parse(raw) as CachedWordStresses) : null;
    } catch (err) {
      this.logger.warn(`Word stresses not read from cache: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  async set(key: string, value: CachedWordStresses): Promise<void> {
    const client = this.redis.getClient();
    if (!client || !this.redis.isReady()) return;
    await client.set(NAMESPACE + key, JSON.stringify(value), 'EX', TTL_SECONDS).catch((err: Error) => {
      this.logger.warn(`Word stresses not cached: ${err.message}`);
    });
  }
}
