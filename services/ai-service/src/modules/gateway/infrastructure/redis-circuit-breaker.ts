import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../../config/configuration.js';
import { RedisService } from '../../../infrastructure/cache/redis.service.js';
import {
  BreakerStoreUnavailableError,
  type BreakerSettings,
  type BreakerState,
  type IBreakerInspector,
} from '../application/ports/breaker-inspector.port.js';
import type { ICircuitBreaker } from '../application/ports/circuit-breaker.port.js';

/** Longest a provider's Retry-After may hold a model out — beyond that, ask again. */
const MAX_RETRY_AFTER_MS = 5 * 60_000;

type RedisClient = NonNullable<ReturnType<RedisService['getClient']>>;

/**
 * Shared across instances through Redis, so one instance's run of 429s spares the others.
 *
 * `fail:<key>` counts retryable failures in a fixed window; at the threshold `open:<key>`
 * is set with a TTL and the count cleared. When `open` expires the next call goes through
 * (half-open): success clears the count, failure starts a new one. A success always
 * clears the count, so only failures without a success between them add up.
 *
 * The router's side fails open (Redis away = every breaker closed); the admin's side
 * (`IBreakerInspector`) says `unknown` instead, and a reset without Redis is an error.
 */
@Injectable()
export class RedisCircuitBreaker implements ICircuitBreaker, IBreakerInspector {
  private readonly logger = new Logger(RedisCircuitBreaker.name);
  private readonly tuning: AppConfig['breaker'];

  constructor(
    private readonly redis: RedisService,
    config: ConfigService<AppConfig>,
  ) {
    this.tuning = config.get<AppConfig['breaker']>('breaker') ?? { failures: 5, windowMs: 60_000, openMs: 30_000 };
  }

  async isOpen(key: string): Promise<boolean> {
    return this.run('isOpen', false, async (client) => (await client.exists(openKey(key))) === 1);
  }

  async recordFailure(key: string, retryAfterMs?: number): Promise<void> {
    await this.run('recordFailure', undefined, async (client) => {
      if (retryAfterMs && retryAfterMs > 0) {
        await client.set(openKey(key), '1', 'PX', Math.min(retryAfterMs, MAX_RETRY_AFTER_MS));
        await client.del(failKey(key));
        return;
      }
      const failures = await client.incr(failKey(key));
      if (failures === 1) await client.pexpire(failKey(key), this.tuning.windowMs);
      if (failures >= this.tuning.failures) {
        await client.set(openKey(key), '1', 'PX', this.tuning.openMs);
        await client.del(failKey(key));
        this.logger.warn(`Breaker opened for model ${key} after ${failures} failures`);
      }
    });
  }

  async recordSuccess(key: string): Promise<void> {
    await this.run('recordSuccess', undefined, async (client) => {
      await client.del(failKey(key));
    });
  }

  settings(): BreakerSettings {
    return { ...this.tuning, maxRetryAfterMs: MAX_RETRY_AFTER_MS };
  }

  async inspect(keys: string[]): Promise<Map<string, BreakerState>> {
    const unknown = new Map<string, BreakerState>(
      keys.map((k) => [k, { state: 'unknown', reopensInMs: null, recentFailures: null }]),
    );
    if (keys.length === 0) return unknown;
    return this.run('inspect', unknown, async (client) => {
      // One round trip: PTTL of `open` and the failure count, per key.
      const pipeline = client.pipeline();
      for (const key of keys) pipeline.pttl(openKey(key)).get(failKey(key));
      const replies = (await pipeline.exec()) ?? [];
      const states = new Map<string, BreakerState>();
      keys.forEach((key, i) => {
        const [ttlErr, ttl] = replies[2 * i] ?? [new Error('no reply'), null];
        const [failErr, fail] = replies[2 * i + 1] ?? [new Error('no reply'), null];
        if (ttlErr || failErr) {
          states.set(key, { state: 'unknown', reopensInMs: null, recentFailures: null });
          return;
        }
        const recentFailures = Number(fail ?? 0) || 0;
        // PTTL: -2 = no key, -1 = no expiry (never set that way; read as open with no end in sight → 0).
        const pttl = Number(ttl);
        if (pttl === -2) states.set(key, { state: 'closed', reopensInMs: null, recentFailures });
        else states.set(key, { state: 'open', reopensInMs: Math.max(pttl, 0), recentFailures });
      });
      return states;
    });
  }

  async reset(key: string): Promise<void> {
    const client = this.redis.getClient();
    if (!client || !this.redis.isReady()) throw new BreakerStoreUnavailableError();
    try {
      await client.del(openKey(key), failKey(key));
    } catch (err) {
      throw new BreakerStoreUnavailableError(`Breaker reset failed: ${(err as Error).message}`);
    }
    this.logger.log(`Breaker reset by hand for model ${key}`);
  }

  private async run<T>(op: string, whenUnavailable: T, fn: (client: RedisClient) => Promise<T>): Promise<T> {
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

function openKey(key: string): string {
  return `breaker:open:${key}`;
}

function failKey(key: string): string {
  return `breaker:fail:${key}`;
}
