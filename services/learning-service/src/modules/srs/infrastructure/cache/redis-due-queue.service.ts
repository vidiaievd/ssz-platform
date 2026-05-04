import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../../../infrastructure/cache/redis.service.js';

// Sorted-set cache of due card IDs per user, scored by dueAt epoch-ms.
// Key: learning:srs:due:{userId}  (the "learning:" prefix is added by the Redis client).
// Populated lazily on first getDue call; invalidated on every reschedule.
// Using epoch-ms scores means ZRANGEBYSCORE 0 now returns all currently due cards.

const KEY_PREFIX = 'srs:due:';

@Injectable()
export class RedisDueQueueService {
  private readonly logger = new Logger(RedisDueQueueService.name);

  constructor(private readonly redis: RedisService) {}

  private key(userId: string): string {
    return `${KEY_PREFIX}${userId}`;
  }

  /** Return up to `limit` card IDs due at or before `now`, ordered by dueAt ascending. */
  async getDueCardIds(userId: string, now: Date, limit: number): Promise<string[] | null> {
    const client = this.redis.getClient();
    if (!client) return null;

    try {
      const exists = await client.exists(this.key(userId));
      if (!exists) return null; // cache miss — caller falls back to DB

      const ids = await client.zrangebyscore(
        this.key(userId),
        0,
        now.getTime(),
        'LIMIT',
        0,
        limit,
      );
      return ids;
    } catch (err) {
      this.logger.error(`getDueCardIds(${userId}): ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  /** Populate the cache from a DB-sourced list of (cardId, dueAt) pairs. */
  async populate(
    userId: string,
    cards: Array<{ id: string; dueAt: Date }>,
  ): Promise<void> {
    const client = this.redis.getClient();
    if (!client || cards.length === 0) return;

    try {
      const key = this.key(userId);
      const args: Array<number | string> = [];
      for (const c of cards) {
        args.push(c.dueAt.getTime(), c.id);
      }
      await client.zadd(key, ...args);
      // Expire after 1 hour; the queue is invalidated on any reschedule anyway.
      await client.expire(key, 3600);
    } catch (err) {
      this.logger.error(`populate(${userId}): ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** Upsert a single card's score (called after each review to keep the set consistent). */
  async upsert(userId: string, cardId: string, dueAt: Date): Promise<void> {
    const client = this.redis.getClient();
    if (!client) return;

    try {
      const key = this.key(userId);
      const exists = await client.exists(key);
      if (!exists) return; // cache not warm; no-op, next getDue will re-populate

      await client.zadd(key, dueAt.getTime(), cardId);
    } catch (err) {
      this.logger.error(`upsert(${userId}, ${cardId}): ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** Invalidate the entire queue for a user (conservative reset). */
  async invalidate(userId: string): Promise<void> {
    const client = this.redis.getClient();
    if (!client) return;

    try {
      await client.del(this.key(userId));
    } catch (err) {
      this.logger.error(`invalidate(${userId}): ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
