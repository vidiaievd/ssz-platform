import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../../../infrastructure/cache/redis.service.js';
import { SRS_TRACKS, type SrsTrack } from '../../domain/value-objects/srs-track.js';

// Sorted-set cache of due card IDs per user, scored by dueAt epoch-ms.
// Key: learning:srs:due:{userId}  (the "learning:" prefix is added by the Redis client).
// Populated lazily on first getDue call; invalidated on every reschedule.
// Using epoch-ms scores means ZRANGEBYSCORE 0 now returns all currently due cards.

const KEY_PREFIX = 'srs:due:';

@Injectable()
export class RedisDueQueueService {
  private readonly logger = new Logger(RedisDueQueueService.name);

  constructor(private readonly redis: RedisService) {}

  /**
   * One set for the day's whole queue, one per track (plan 63 phase 6).
   *
   * Filtering the whole set after reading it would be wrong rather than merely slow: it
   * is read `LIMIT 0 limit`, so a page of twenty lexical cards would answer "nothing due"
   * on the grammar track while a hundred grammar cards waited behind it.
   */
  private key(userId: string, track?: SrsTrack): string {
    return track ? `${KEY_PREFIX}${userId}:${track}` : `${KEY_PREFIX}${userId}`;
  }

  /** Return up to `limit` card IDs due at or before `now`, ordered by dueAt ascending. */
  async getDueCardIds(
    userId: string,
    now: Date,
    limit: number,
    track?: SrsTrack,
  ): Promise<string[] | null> {
    const client = this.redis.getClient();
    if (!client) return null;

    try {
      const exists = await client.exists(this.key(userId, track));
      if (!exists) return null; // cache miss — caller falls back to DB

      const ids = await client.zrangebyscore(
        this.key(userId, track),
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
    track?: SrsTrack,
  ): Promise<void> {
    const client = this.redis.getClient();
    if (!client || cards.length === 0) return;

    try {
      const key = this.key(userId, track);
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

  /**
   * Upsert a single card's score (called after each review to keep the set consistent).
   *
   * Written into the whole-day set and into its own track's set, and into neither of the
   * others: a card belongs to one track, so the set that does not hold it must not learn
   * about it.
   */
  async upsert(userId: string, cardId: string, dueAt: Date, track?: SrsTrack): Promise<void> {
    const client = this.redis.getClient();
    if (!client) return;

    try {
      for (const key of [this.key(userId), ...(track ? [this.key(userId, track)] : [])]) {
        const exists = await client.exists(key);
        if (!exists) continue; // cache not warm; no-op, next getDue will re-populate

        await client.zadd(key, dueAt.getTime(), cardId);
      }
    } catch (err) {
      this.logger.error(`upsert(${userId}, ${cardId}): ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** Invalidate the entire queue for a user (conservative reset). */
  async invalidate(userId: string): Promise<void> {
    const client = this.redis.getClient();
    if (!client) return;

    try {
      await client.del(this.key(userId), ...SRS_TRACKS.map((track) => this.key(userId, track)));
    } catch (err) {
      this.logger.error(`invalidate(${userId}): ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
