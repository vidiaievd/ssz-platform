import type { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../../../config/configuration.js';
import type { RedisService } from '../../../../infrastructure/cache/redis.service.js';
import { RedisAssistRateLimiter } from './redis-assist-rate-limiter.js';

const config = { get: () => ({ messages: 2, windowMs: 600_000 }) } as unknown as ConfigService<AppConfig>;

/** A Redis that counts per key the way the script does. */
function redis(opts: { ready?: boolean; fails?: boolean } = {}) {
  const counts = new Map<string, number>();
  const keys: string[] = [];
  const client = {
    eval: async (_script: string, _n: number, key: string, windowMs: number) => {
      if (opts.fails) throw new Error('READONLY');
      keys.push(key);
      const n = (counts.get(key) ?? 0) + 1;
      counts.set(key, n);
      return [n, windowMs - 1_000];
    },
  };
  const service = { getClient: () => client, isReady: () => opts.ready ?? true } as unknown as RedisService;
  return { service, keys };
}

describe('RedisAssistRateLimiter', () => {
  it('lets the window’s messages through and refuses the next with the time left, per learner', async () => {
    const { service, keys } = redis();
    const limiter = new RedisAssistRateLimiter(service, config);
    expect(await limiter.take('u1')).toEqual({ allowed: true });
    expect(await limiter.take('u1')).toEqual({ allowed: true });
    expect(await limiter.take('u1')).toEqual({ allowed: false, retryAfterMs: 599_000 });
    expect(await limiter.take('u2')).toEqual({ allowed: true });
    expect(keys[0]).toBe('assist:rl:u1');
  });

  it('fails open when Redis is away or the script fails', async () => {
    expect(await new RedisAssistRateLimiter(redis({ ready: false }).service, config).take('u1')).toEqual({ allowed: true });
    const failing = new RedisAssistRateLimiter(redis({ fails: true }).service, config);
    jest.spyOn((failing as unknown as { logger: { warn: () => void } }).logger, 'warn').mockImplementation(() => undefined);
    expect(await failing.take('u1')).toEqual({ allowed: true });
  });
});
