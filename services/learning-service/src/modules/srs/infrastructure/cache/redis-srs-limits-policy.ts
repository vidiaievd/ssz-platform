import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../../../infrastructure/cache/redis.service.js';
import type { ISrsLimitsPolicy } from '../../application/ports/srs-limits-policy.port.js';
import type { AppConfig } from '../../../../config/configuration.js';

// MVP simplification: all daily caps use midnight UTC as the day boundary.
// Per-user timezone support deferred to post-MVP.

@Injectable()
export class RedisSrsLimitsPolicy implements ISrsLimitsPolicy {
  private readonly logger = new Logger(RedisSrsLimitsPolicy.name);

  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService<AppConfig>,
  ) {}

  async canIntroduceNewCard(userId: string, today: Date): Promise<boolean> {
    const limit = this.config.get<AppConfig['srs']>('srs')?.dailyNewCardsLimit ?? 20;
    const count = await this.getCount(this.newCardKey(userId, today));
    return count < limit;
  }

  async canReview(userId: string, today: Date): Promise<boolean> {
    const limit = this.config.get<AppConfig['srs']>('srs')?.dailyReviewsLimit ?? 200;
    const count = await this.getCount(this.reviewKey(userId, today));
    return count < limit;
  }

  async incrementNewCardCount(userId: string, today: Date): Promise<void> {
    await this.increment(this.newCardKey(userId, today), today);
  }

  async incrementReviewCount(userId: string, today: Date): Promise<void> {
    await this.increment(this.reviewKey(userId, today), today);
  }

  private newCardKey(userId: string, date: Date): string {
    return `srs:limits:${userId}:new:${this.dateString(date)}`;
  }

  private reviewKey(userId: string, date: Date): string {
    return `srs:limits:${userId}:reviews:${this.dateString(date)}`;
  }

  private dateString(date: Date): string {
    return date.toISOString().slice(0, 10); // YYYY-MM-DD UTC
  }

  private secondsUntilMidnightUtc(date: Date): number {
    const next = new Date(date);
    next.setUTCHours(24, 0, 0, 0);
    return Math.ceil((next.getTime() - date.getTime()) / 1000);
  }

  private async getCount(key: string): Promise<number> {
    const client = this.redis.getClient();
    if (!client) return 0;

    try {
      const raw = await client.get(key);
      return raw ? parseInt(raw, 10) : 0;
    } catch (err) {
      this.logger.error(`getCount(${key}): ${err instanceof Error ? err.message : String(err)}`);
      // Fail open: treat as 0 so limits don't block users on Redis outage.
      return 0;
    }
  }

  private async increment(key: string, today: Date): Promise<void> {
    const client = this.redis.getClient();
    if (!client) return;

    try {
      const ttl = this.secondsUntilMidnightUtc(today);
      // INCR is atomic; EXPIRE only on key creation (NX) to avoid resetting TTL mid-day.
      const count = await client.incr(key);
      if (count === 1) {
        await client.expire(key, ttl);
      }
    } catch (err) {
      this.logger.error(`increment(${key}): ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
