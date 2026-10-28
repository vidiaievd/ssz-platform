import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../../../config/configuration.js';
import { RedisService } from '../../../../infrastructure/cache/redis.service.js';
import type { AssistRateDecision, IAssistRateLimiter } from '../application/ports/assist-rate-limiter.js';

// The client adds the `ai:` prefix: `ai:assist:rl:<userId>`.
const NAMESPACE = 'assist:rl:';

// A fixed window opened by the first message: count it, give a new key its lifetime, and
// answer the count with the time left.
const TAKE = `local n = redis.call('incr', KEYS[1])
if n == 1 then redis.call('pexpire', KEYS[1], ARGV[1]) end
local ttl = redis.call('pttl', KEYS[1])
if ttl < 0 then redis.call('pexpire', KEYS[1], ARGV[1]) ttl = tonumber(ARGV[1]) end
return { n, ttl }`;

/**
 * Fails open like the rest of Redis here: with Redis away the learner is not limited — the
 * gate's quota still holds the payer's spend; the limit only guards against a burst.
 */
@Injectable()
export class RedisAssistRateLimiter implements IAssistRateLimiter {
  private readonly logger = new Logger(RedisAssistRateLimiter.name);
  private readonly limit: number;
  private readonly windowMs: number;

  constructor(
    private readonly redis: RedisService,
    config: ConfigService<AppConfig>,
  ) {
    const rate = config.get<AppConfig['assistRateLimit']>('assistRateLimit')!;
    this.limit = rate.messages;
    this.windowMs = rate.windowMs;
  }

  async take(userId: string): Promise<AssistRateDecision> {
    const client = this.redis.getClient();
    if (!client || !this.redis.isReady()) return { allowed: true };
    try {
      const [count, ttl] = (await client.eval(TAKE, 1, `${NAMESPACE}${userId}`, this.windowMs)) as [number, number];
      return count <= this.limit ? { allowed: true } : { allowed: false, retryAfterMs: ttl };
    } catch (err) {
      this.logger.warn(`Assistant rate limit not checked for ${userId}: ${err instanceof Error ? err.message : String(err)}`);
      return { allowed: true };
    }
  }
}
