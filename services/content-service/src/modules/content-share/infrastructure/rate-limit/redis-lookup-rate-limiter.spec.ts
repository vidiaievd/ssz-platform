import { RedisLookupRateLimiter } from './redis-lookup-rate-limiter.js';

function make(client: unknown) {
  const redis = { getClient: () => client };
  const config = { get: () => ({ limit: 2, windowMs: 600_000 }) };
  return new RedisLookupRateLimiter(redis as any, config as any);
}

/** A fake MULTI whose exec answers [set, incr, pttl] like ioredis does. */
function fakeClient(counts: number[], ttl = 300_000) {
  const calls: unknown[][] = [];
  let i = 0;
  const chain: any = {
    set: (...a: unknown[]) => (calls.push(['set', ...a]), chain),
    incr: (...a: unknown[]) => (calls.push(['incr', ...a]), chain),
    pttl: (...a: unknown[]) => (calls.push(['pttl', ...a]), chain),
    exec: async () => [[null, 'OK'], [null, counts[i++]], [null, ttl]],
  };
  return { client: { multi: () => chain }, calls };
}

describe('RedisLookupRateLimiter', () => {
  it('lets the limit through and refuses the next one with the window left', async () => {
    const { client, calls } = fakeClient([1, 2, 3]);
    const limiter = make(client);
    await expect(limiter.consume('u-1')).resolves.toEqual({ allowed: true, retryAfterMs: 0 });
    await expect(limiter.consume('u-1')).resolves.toEqual({ allowed: true, retryAfterMs: 0 });
    await expect(limiter.consume('u-1')).resolves.toEqual({ allowed: false, retryAfterMs: 300_000 });
    expect(calls[0]).toEqual(['set', 'user-lookup:rl:u-1', 0, 'PX', 600_000, 'NX']);
  });

  it('lets through when Redis is off or fails', async () => {
    await expect(make(null).consume('u-1')).resolves.toEqual({ allowed: true, retryAfterMs: 0 });
    const broken = { multi: () => ({ set() { return this; }, incr() { return this; }, pttl() { return this; }, exec: async () => { throw new Error('down'); } }) };
    await expect(make(broken).consume('u-1')).resolves.toEqual({ allowed: true, retryAfterMs: 0 });
  });
});
