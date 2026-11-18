import type { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../../config/configuration.js';
import type { RedisService } from '../../../infrastructure/cache/redis.service.js';
import { BreakerStoreUnavailableError } from '../application/ports/breaker-inspector.port.js';
import { RedisCircuitBreaker } from './redis-circuit-breaker.js';

const config = { get: () => ({ failures: 3, windowMs: 60_000, openMs: 30_000 }) } as unknown as ConfigService<AppConfig>;

/** A Redis of plain values and TTLs; `pipeline` replays the queued reads as `exec` replies. */
function redis(opts: { ready?: boolean; fails?: boolean; pipelineError?: boolean } = {}) {
  const values = new Map<string, string>();
  const ttls = new Map<string, number>();
  const deleted: string[][] = [];
  const client = {
    del: async (...keys: string[]) => {
      if (opts.fails) throw new Error('READONLY');
      deleted.push(keys);
      keys.forEach((k) => values.delete(k));
    },
    pipeline: () => {
      const ops: (() => [Error | null, unknown])[] = [];
      const p = {
        pttl: (k: string) => {
          ops.push(() => [opts.pipelineError ? new Error('LOADING') : null, values.has(k) ? (ttls.get(k) ?? -1) : -2]);
          return p;
        },
        get: (k: string) => {
          ops.push(() => [null, values.get(k) ?? null]);
          return p;
        },
        exec: async () => {
          if (opts.fails) throw new Error('connection lost');
          return ops.map((op) => op());
        },
      };
      return p;
    },
  };
  const service = { getClient: () => client, isReady: () => opts.ready ?? true } as unknown as RedisService;
  return { service, values, ttls, deleted };
}

function quiet(breaker: RedisCircuitBreaker) {
  const logger = (breaker as unknown as { logger: { warn: () => void; log: () => void } }).logger;
  jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  jest.spyOn(logger, 'log').mockImplementation(() => undefined);
  return breaker;
}

describe('RedisCircuitBreaker as the admin sees it', () => {
  it('reads open with the time left, closed with the failures counted, in the order asked', async () => {
    const { service, values, ttls } = redis();
    values.set('breaker:open:m1', '1');
    ttls.set('breaker:open:m1', 12_500);
    values.set('breaker:fail:m2', '2');
    const states = await new RedisCircuitBreaker(service, config).inspect(['m2', 'm1', 'm3']);
    expect([...states.keys()]).toEqual(['m2', 'm1', 'm3']);
    expect(states.get('m1')).toEqual({ state: 'open', reopensInMs: 12_500, recentFailures: 0 });
    expect(states.get('m2')).toEqual({ state: 'closed', reopensInMs: null, recentFailures: 2 });
    expect(states.get('m3')).toEqual({ state: 'closed', reopensInMs: null, recentFailures: 0 });
  });

  it('says unknown — not closed — when Redis is away, fails, or a reply is an error', async () => {
    const unknown = { state: 'unknown', reopensInMs: null, recentFailures: null };
    const away = await new RedisCircuitBreaker(redis({ ready: false }).service, config).inspect(['m1']);
    expect(away.get('m1')).toEqual(unknown);
    const failing = await quiet(new RedisCircuitBreaker(redis({ fails: true }).service, config)).inspect(['m1']);
    expect(failing.get('m1')).toEqual(unknown);
    const replyError = await new RedisCircuitBreaker(redis({ pipelineError: true }).service, config).inspect(['m1']);
    expect(replyError.get('m1')).toEqual(unknown);
  });

  it('reset drops both keys of the model', async () => {
    const { service, deleted } = redis();
    await quiet(new RedisCircuitBreaker(service, config)).reset('m1');
    expect(deleted).toEqual([['breaker:open:m1', 'breaker:fail:m1']]);
  });

  it('reset without Redis is an error, never a silent success', async () => {
    await expect(new RedisCircuitBreaker(redis({ ready: false }).service, config).reset('m1')).rejects.toBeInstanceOf(
      BreakerStoreUnavailableError,
    );
    await expect(new RedisCircuitBreaker(redis({ fails: true }).service, config).reset('m1')).rejects.toBeInstanceOf(
      BreakerStoreUnavailableError,
    );
  });

  it('hands out its thresholds with the Retry-After cap', () => {
    expect(new RedisCircuitBreaker(redis().service, config).settings()).toEqual({
      failures: 3,
      windowMs: 60_000,
      openMs: 30_000,
      maxRetryAfterMs: 300_000,
    });
  });
});
