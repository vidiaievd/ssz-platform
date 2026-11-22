import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../../../config/configuration.js';
import { RedisService } from '../../../../infrastructure/cache/redis.service.js';
import type { ILookupRateLimiter } from '../../application/ports/lookup-rate-limiter.port.js';

/**
 * Fixed window per asker in Redis: `user-lookup:rl:<userId>` (under the service's `content:` prefix),
 * the window opens with `SET … PX NX`, then INCR. Redis down → the lookup is let through and the failure logged:
 * it is still guarded by the edit right on the material, and sharing must not stop with the cache.
 */
@Injectable()
export class RedisLookupRateLimiter implements ILookupRateLimiter {
  private readonly logger = new Logger(RedisLookupRateLimiter.name);
  private readonly limit: number;
  private readonly windowMs: number;

  constructor(
    private readonly redis: RedisService,
    config: ConfigService<AppConfig>,
  ) {
    const rl = config.get<AppConfig['userLookupRateLimit']>('userLookupRateLimit')!;
    this.limit = rl.limit;
    this.windowMs = rl.windowMs;
  }

  async consume(askerId: string): Promise<{ allowed: boolean; retryAfterMs: number }> {
    const client = this.redis.getClient();
    if (!client) return { allowed: true, retryAfterMs: 0 };
    const key = `user-lookup:rl:${askerId}`;
    try {
      const results = await client.multi().set(key, 0, 'PX', this.windowMs, 'NX').incr(key).pttl(key).exec();
      const count = Number(results?.[1]?.[1] ?? 0);
      const ttl = Number(results?.[2]?.[1] ?? this.windowMs);
      if (count > this.limit) return { allowed: false, retryAfterMs: ttl > 0 ? ttl : this.windowMs };
      return { allowed: true, retryAfterMs: 0 };
    } catch (err) {
      this.logger.warn(`user lookup rate limit unreadable, letting through: ${err instanceof Error ? err.message : String(err)}`);
      return { allowed: true, retryAfterMs: 0 };
    }
  }
}
