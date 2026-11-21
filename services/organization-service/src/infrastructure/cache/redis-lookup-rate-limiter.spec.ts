import { RedisLookupRateLimiter } from './redis-lookup-rate-limiter.js';

const config = { get: (key: string) => ({ USER_LOOKUP_RATE_LIMIT: 2, USER_LOOKUP_RATE_WINDOW_MS: 600_000 } as Record<string, unknown>)[key] };

function fakeClient(counts: number[], ttl = 300_000) {
  const calls: unknown[][] = [];
  let i = 0;
  const chain: any = {
    set: (...a: unknown[]) => (calls.push(['set', ...a]), chain),
    incr: (...a: unknown[]) => (calls.push(['incr', ...a]), chain),
    pttl: (...a: unknown[]) => (calls.push(['pttl', ...a]), chain),
    exec: async () => [[null, 'OK'], [null, counts[i++]], [null, ttl]],
  };
  return { client: { multi: () => chain, on: () => undefined, quit: async () => 'OK' }, calls };
}

describe('RedisLookupRateLimiter', () => {
  it('lets the limit through and refuses the next one with the window left', async () => {
    const { client, calls } = fakeClient([1, 2, 3]);
    const limiter = new RedisLookupRateLimiter(config as never, client as never);
    await expect(limiter.consume('u-1')).resolves.toEqual({ allowed: true, retryAfterMs: 0 });
    await expect(limiter.consume('u-1')).resolves.toEqual({ allowed: true, retryAfterMs: 0 });
    await expect(limiter.consume('u-1')).resolves.toEqual({ allowed: false, retryAfterMs: 300_000 });
    expect(calls[0]).toEqual(['set', 'user-lookup:rl:u-1', 0, 'PX', 600_000, 'NX']);
  });

  it('lets through without Redis or when it fails', async () => {
    await expect(new RedisLookupRateLimiter(config as never, null).consume('u-1')).resolves.toEqual({ allowed: true, retryAfterMs: 0 });
    const broken: any = { on: () => undefined, multi: () => broken, set: () => broken, incr: () => broken, pttl: () => broken, exec: async () => { throw new Error('down'); } };
    await expect(new RedisLookupRateLimiter(config as never, broken).consume('u-1')).resolves.toEqual({ allowed: true, retryAfterMs: 0 });
  });
});
