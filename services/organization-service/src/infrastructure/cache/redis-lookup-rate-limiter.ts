import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import type { Env } from '../../config/configuration.js';
import type { ILookupRateLimiter } from '../../modules/schools/application/ports/lookup-rate-limiter.port.js';

/**
 * Fixed window per asker: `org:user-lookup:rl:<userId>` in Redis DB `REDIS_DB` (7). The window
 * opens with `SET … PX NX`, then INCR. Without Redis (not configured, down) the lookup is let
 * through and the failure logged — the asker's place in the school is still checked, and adding
 * people must not stop with the cache.
 */
@Injectable()
export class RedisLookupRateLimiter implements ILookupRateLimiter, OnModuleDestroy {
  private readonly logger = new Logger(RedisLookupRateLimiter.name);
  private readonly client: Redis | null;
  private readonly limit: number;
  private readonly windowMs: number;

  constructor(config: ConfigService<Env>, client?: Redis | null) {
    this.limit = config.get('USER_LOOKUP_RATE_LIMIT', { infer: true }) ?? 60;
    this.windowMs = config.get('USER_LOOKUP_RATE_WINDOW_MS', { infer: true }) ?? 600_000;
    const host = config.get('REDIS_HOST', { infer: true });
    this.client =
      client !== undefined
        ? client
        : host
          ? new Redis({
              host,
              port: config.get('REDIS_PORT', { infer: true }) ?? 6379,
              password: config.get('REDIS_PASSWORD', { infer: true }) || undefined,
              db: config.get('REDIS_DB', { infer: true }) ?? 7,
              keyPrefix: 'org:',
              maxRetriesPerRequest: 1,
              retryStrategy: () => 3000,
            })
          : null;
    if (!this.client) this.logger.warn('REDIS_HOST is not configured — user lookups are not rate limited');
    this.client?.on('error', (err: Error) => this.logger.error(`Redis error: ${err.message}`));
  }

  async consume(askerId: string): Promise<{ allowed: boolean; retryAfterMs: number }> {
    if (!this.client) return { allowed: true, retryAfterMs: 0 };
    const key = `user-lookup:rl:${askerId}`;
    try {
      const results = await this.client.multi().set(key, 0, 'PX', this.windowMs, 'NX').incr(key).pttl(key).exec();
      const count = Number(results?.[1]?.[1] ?? 0);
      const ttl = Number(results?.[2]?.[1] ?? this.windowMs);
      if (count > this.limit) return { allowed: false, retryAfterMs: ttl > 0 ? ttl : this.windowMs };
      return { allowed: true, retryAfterMs: 0 };
    } catch (err) {
      this.logger.warn(`user lookup rate limit unreadable, letting through: ${err instanceof Error ? err.message : String(err)}`);
      return { allowed: true, retryAfterMs: 0 };
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.quit().catch(() => undefined);
  }
}
