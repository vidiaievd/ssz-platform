import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../../config/configuration.js';
import { RedisService } from '../../../infrastructure/cache/redis.service.js';
import type { ICircuitBreaker } from '../application/ports/circuit-breaker.port.js';

/** Longest a provider's Retry-After may hold a model out — beyond that, ask again. */
const MAX_RETRY_AFTER_MS = 5 * 60_000;

/**
 * Shared across instances through Redis, so one instance's run of 429s spares the others.
 *
 * `fail:<key>` counts retryable failures in a fixed window; at the threshold `open:<key>`
 * is set with a TTL and the count cleared. When `open` expires the next call goes through
 * (half-open): success clears the count, failure starts a new one. A success always
 * clears the count, so only failures without a success between them add up.
 */
@Injectable()
export class RedisCircuitBreaker implements ICircuitBreaker {
  private readonly logger = new Logger(RedisCircuitBreaker.name);
  private readonly settings: AppConfig['breaker'];

  constructor(
    private readonly redis: RedisService,
    config: ConfigService<AppConfig>,
  ) {
    this.settings = config.get<AppConfig['breaker']>('breaker') ?? { failures: 5, windowMs: 60_000, openMs: 30_000 };
  }

  async isOpen(key: string): Promise<boolean> {
    return this.run('isOpen', false, async (client) => (await client.exists(`breaker:open:${key}`)) === 1);
  }

  async recordFailure(key: string, retryAfterMs?: number): Promise<void> {
    await this.run('recordFailure', undefined, async (client) => {
      if (retryAfterMs && retryAfterMs > 0) {
        await client.set(`breaker:open:${key}`, '1', 'PX', Math.min(retryAfterMs, MAX_RETRY_AFTER_MS));
        await client.del(`breaker:fail:${key}`);
        return;
      }
      const failures = await client.incr(`breaker:fail:${key}`);
      if (failures === 1) await client.pexpire(`breaker:fail:${key}`, this.settings.windowMs);
      if (failures >= this.settings.failures) {
        await client.set(`breaker:open:${key}`, '1', 'PX', this.settings.openMs);
        await client.del(`breaker:fail:${key}`);
        this.logger.warn(`Breaker opened for model ${key} after ${failures} failures`);
      }
    });
  }

  async recordSuccess(key: string): Promise<void> {
    await this.run('recordSuccess', undefined, async (client) => {
      await client.del(`breaker:fail:${key}`);
    });
  }

  private async run<T>(
    op: string,
    whenUnavailable: T,
    fn: (client: NonNullable<ReturnType<RedisService['getClient']>>) => Promise<T>,
  ): Promise<T> {
    const client = this.redis.getClient();
    if (!client || !this.redis.isReady()) return whenUnavailable;
    try {
      return await fn(client);
    } catch (err) {
      this.logger.warn(`Breaker ${op} skipped: ${(err as Error).message}`);
      return whenUnavailable;
    }
  }
}
