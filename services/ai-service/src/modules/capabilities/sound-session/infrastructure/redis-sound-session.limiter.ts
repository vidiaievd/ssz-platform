import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../../../config/configuration.js';
import { RedisService } from '../../../../infrastructure/cache/redis.service.js';
import type { ISoundSessionLimiter, SessionBeginDecision } from '../application/ports/sound-session.limiter.js';

// The client adds the `ai:` prefix: `ai:sound-session:day:<userId>`, `ai:sound-session:takes:<sessionId>`.
const DAY = 'sound-session:day:';
const TAKES = 'sound-session:takes:';
const DAY_MS = 86_400_000;
// A session's probe lives 6 hours; a day keeps the take count past any session.
const TAKES_TTL_MS = DAY_MS;

// Count one; a new key lives for ARGV[1] ms. Answers the count and the time left.
const COUNT = `local n = redis.call('incr', KEYS[1])
if n == 1 then redis.call('pexpire', KEYS[1], ARGV[1]) end
local ttl = redis.call('pttl', KEYS[1])
if ttl < 0 then redis.call('pexpire', KEYS[1], ARGV[1]) ttl = tonumber(ARGV[1]) end
return { n, ttl }`;

/** Fails open: with Redis away the gate's quota still holds the spend, and the engine its 10 takes. */
@Injectable()
export class RedisSoundSessionLimiter implements ISoundSessionLimiter {
  private readonly logger = new Logger(RedisSoundSessionLimiter.name);
  private readonly dailyLimit: number;
  private readonly takeLimit: number;

  constructor(
    private readonly redis: RedisService,
    config: ConfigService<AppConfig>,
  ) {
    const limits = config.get<AppConfig['soundSession']>('soundSession')!;
    this.dailyLimit = limits.dailyLimit;
    this.takeLimit = limits.takeLimit;
  }

  async begin(userId: string): Promise<SessionBeginDecision> {
    const counted = await this.count(`${DAY}${userId}`, DAY_MS - (Date.now() % DAY_MS));
    if (!counted) return { allowed: true };
    return counted.count <= this.dailyLimit ? { allowed: true } : { allowed: false, retryAfterMs: counted.ttl };
  }

  async take(sessionId: string): Promise<boolean> {
    const counted = await this.count(`${TAKES}${sessionId}`, TAKES_TTL_MS);
    return !counted || counted.count <= this.takeLimit;
  }

  private async count(key: string, ttlMs: number): Promise<{ count: number; ttl: number } | null> {
    const client = this.redis.getClient();
    if (!client || !this.redis.isReady()) return null;
    try {
      const [count, ttl] = (await client.eval(COUNT, 1, key, ttlMs)) as [number, number];
      return { count, ttl };
    } catch (err) {
      this.logger.warn(`Session limit not checked (${key}): ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }
}
