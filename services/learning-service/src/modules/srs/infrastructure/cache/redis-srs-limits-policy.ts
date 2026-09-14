import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../../../infrastructure/cache/redis.service.js';
import type {
  ISrsLimitsPolicy,
  SrsLimitKind,
} from '../../application/ports/srs-limits-policy.port.js';
import { SRS_TRACKS, type SrsTrack } from '../../domain/value-objects/srs-track.js';
import type { AppConfig } from '../../../../config/configuration.js';

// MVP simplification: all daily caps use midnight UTC as the day boundary.
// Per-user timezone support deferred to post-MVP.

// Fallbacks for a config that predates the per-track caps (plan 63 phase 6). The whole
// of the old budget goes to the lexical track, which is where every card a learner is
// served today already lives.
const FALLBACK_NEW: Record<SrsTrack, number> = { lexis: 20, grammar: 5 };
const FALLBACK_REVIEWS: Record<SrsTrack, number> = { lexis: 200, grammar: 50 };

@Injectable()
export class RedisSrsLimitsPolicy implements ISrsLimitsPolicy {
  private readonly logger = new Logger(RedisSrsLimitsPolicy.name);

  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService<AppConfig>,
  ) {}

  async canIntroduceNewCard(userId: string, track: SrsTrack, today: Date): Promise<boolean> {
    const count = await this.getCount(this.newCardKey(userId, track, today));
    return count < this.newCardLimit(track);
  }

  async canReview(userId: string, track: SrsTrack, today: Date): Promise<boolean> {
    const count = await this.getCount(this.reviewKey(userId, track, today));
    return count < this.reviewLimit(track);
  }

  async incrementNewCardCount(userId: string, track: SrsTrack, today: Date): Promise<void> {
    await this.increment(this.newCardKey(userId, track, today), today);
  }

  async incrementReviewCount(userId: string, track: SrsTrack, today: Date): Promise<void> {
    await this.increment(this.reviewKey(userId, track, today), today);
  }

  async recordRefusal(
    userId: string,
    kind: SrsLimitKind,
    track: SrsTrack,
    today: Date,
  ): Promise<void> {
    await this.increment(this.refusedKey(userId, kind, track, today), today);
  }

  async getReviewedCount(userId: string, today: Date, track?: SrsTrack): Promise<number> {
    if (track) return this.getCount(this.reviewKey(userId, track, today));

    // "How much have I done today", asked of the day rather than of one memory. Summed
    // over the tracks instead of read from a separate total, so the two can never
    // disagree about the same reviews.
    const counts = await Promise.all(
      SRS_TRACKS.map((t) => this.getCount(this.reviewKey(userId, t, today))),
    );
    return counts.reduce((sum, count) => sum + count, 0);
  }

  getDailyReviewLimit(track?: SrsTrack): number {
    if (track) return this.reviewLimit(track);
    return SRS_TRACKS.reduce((sum, t) => sum + this.reviewLimit(t), 0);
  }

  private newCardLimit(track: SrsTrack): number {
    const srs = this.config.get<AppConfig['srs']>('srs');
    return srs?.dailyNewCardsLimitByTrack?.[track] ?? FALLBACK_NEW[track];
  }

  private reviewLimit(track: SrsTrack): number {
    const srs = this.config.get<AppConfig['srs']>('srs');
    return srs?.dailyReviewsLimitByTrack?.[track] ?? FALLBACK_REVIEWS[track];
  }

  private newCardKey(userId: string, track: SrsTrack, date: Date): string {
    return `srs:limits:${userId}:${track}:new:${this.dateString(date)}`;
  }

  private reviewKey(userId: string, track: SrsTrack, date: Date): string {
    return `srs:limits:${userId}:${track}:reviews:${this.dateString(date)}`;
  }

  /** Mirrors the segment of the counter that refused, so the pair reads as a pair. */
  private refusedKey(userId: string, kind: SrsLimitKind, track: SrsTrack, date: Date): string {
    const segment = kind === 'new' ? 'new' : 'reviews';
    return `srs:limits:${userId}:${track}:refused:${segment}:${this.dateString(date)}`;
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
