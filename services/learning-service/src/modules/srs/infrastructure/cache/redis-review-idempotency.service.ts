import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../../../infrastructure/cache/redis.service.js';

// Dedupe store for review submissions. Offline clients queue reviews and replay
// them on reconnect; a reply lost in flight would otherwise apply the same
// rating twice and push the interval further than the answer earned.
// Key: learning:srs:idem:{userId}:{key}  ("learning:" is added by the client).
//
// Degraded mode: with Redis unavailable every claim succeeds, i.e. replays are
// applied twice — same behaviour as before this store existed, never a block.

const KEY_PREFIX = 'srs:idem:';

/** How long a used key is remembered — an offline queue may sit for days. */
const TTL_SECONDS = 7 * 24 * 60 * 60;

@Injectable()
export class RedisReviewIdempotencyService {
  private readonly logger = new Logger(RedisReviewIdempotencyService.name);

  constructor(private readonly redis: RedisService) {}

  private key(userId: string, idempotencyKey: string): string {
    return `${KEY_PREFIX}${userId}:${idempotencyKey}`;
  }

  /**
   * Reserves the key. Returns true when the caller owns it and should apply the
   * review, false when this key was already used — the caller must return the
   * card's current state instead of rescheduling it again. SET NX makes
   * concurrent replays of one key resolve to a single winner.
   */
  async claim(userId: string, idempotencyKey: string): Promise<boolean> {
    const client = this.redis.getClient();
    if (!client) return true;

    try {
      const res = await client.set(this.key(userId, idempotencyKey), '1', 'EX', TTL_SECONDS, 'NX');
      return res === 'OK';
    } catch (err) {
      this.logger.error(
        `claim(${userId}): ${err instanceof Error ? err.message : String(err)}`,
      );
      return true;
    }
  }

  /**
   * Frees a claimed key after the review failed to apply (daily limit reached,
   * card suspended, …), so a later retry is treated as a fresh attempt rather
   * than silently answered with an unchanged card.
   */
  async release(userId: string, idempotencyKey: string): Promise<void> {
    const client = this.redis.getClient();
    if (!client) return;

    try {
      await client.del(this.key(userId, idempotencyKey));
    } catch (err) {
      this.logger.error(
        `release(${userId}): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
