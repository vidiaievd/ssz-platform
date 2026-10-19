import { jest } from '@jest/globals';
import { RedisSrsLimitsPolicy } from '../../../../../src/modules/srs/infrastructure/cache/redis-srs-limits-policy.js';

const USER_ID = 'c3254eb9-3fb3-4559-9dbf-2cea12f40ed5';
const TODAY   = new Date('2026-04-29T14:00:00Z');

function makePolicy(overrides: {
  newLimit?: number;
  reviewLimit?: number;
  grammarNewLimit?: number;
  grammarReviewLimit?: number;
  redisGet?: jest.Mock;
  redisIncr?: jest.Mock;
  redisExpire?: jest.Mock;
  redisMget?: jest.Mock;
  redisDecr?: jest.Mock;
  clientNull?: boolean;
} = {}) {
  const client = overrides.clientNull ? null : {
    get:    overrides.redisGet    ?? jest.fn<() => Promise<null>>().mockResolvedValue(null),
    incr:   overrides.redisIncr   ?? jest.fn<() => Promise<number>>().mockResolvedValue(1),
    expire: overrides.redisExpire ?? jest.fn<() => Promise<number>>().mockResolvedValue(1),
    mget:   overrides.redisMget   ?? jest.fn(async (...keys: string[]) => keys.map(() => null)),
    decr:   overrides.redisDecr   ?? jest.fn<() => Promise<number>>().mockResolvedValue(0),
  };

  const redis = { getClient: jest.fn().mockReturnValue(client) } as any;

  const config = {
    get: jest.fn().mockReturnValue({
      dailyNewCardsLimit:  overrides.newLimit    ?? 5,
      dailyReviewsLimit:   overrides.reviewLimit ?? 10,
      dailyNewCardsLimitByTrack: {
        lexis:   overrides.newLimit    ?? 5,
        grammar: overrides.grammarNewLimit ?? 2,
      },
      dailyReviewsLimitByTrack: {
        lexis:   overrides.reviewLimit ?? 10,
        grammar: overrides.grammarReviewLimit ?? 4,
      },
    }),
  } as any;

  return { policy: new RedisSrsLimitsPolicy(redis, config), client };
}

describe('RedisSrsLimitsPolicy', () => {
  // Plan 37 §C.1 — the new-card budget hands out days, it never refuses.
  describe('claimNewCardDay', () => {
    const TODAY_START = new Date('2026-04-29T00:00:00Z');
    const TOMORROW    = new Date('2026-04-30T00:00:00Z');
    const IN_3_DAYS   = new Date('2026-05-02T00:00:00Z');

    /** A Redis whose per-day new-card counters start at the given values. */
    function counters(start: Record<string, number>) {
      const store = new Map(Object.entries(start));
      const key = (day: string) => `srs:limits:${USER_ID}:lexis:new:${day}`;
      for (const [day, count] of [...store]) {
        store.delete(day);
        store.set(key(day), count);
      }
      return {
        store,
        key,
        redisMget: jest.fn(async (...keys: string[]) =>
          keys.map((k) => (store.has(k) ? String(store.get(k)) : null)),
        ),
        redisIncr: jest.fn(async (k: string) => {
          store.set(k, (store.get(k) ?? 0) + 1);
          return store.get(k)!;
        }),
        redisDecr: jest.fn(async (k: string) => {
          store.set(k, (store.get(k) ?? 0) - 1);
          return store.get(k)!;
        }),
      };
    }

    it('gives today while today has room, and counts the card on today', async () => {
      const redis = counters({ '2026-04-29': 3 });
      const { policy } = makePolicy({ newLimit: 5, ...redis } as any);

      expect(await policy.claimNewCardDay(USER_ID, 'lexis', TODAY)).toEqual(TODAY_START);
      expect(redis.store.get(redis.key('2026-04-29'))).toBe(4);
    });

    it('gives the next day once today is spent', async () => {
      const redis = counters({ '2026-04-29': 5 });
      const { policy } = makePolicy({ newLimit: 5, ...redis } as any);

      expect(await policy.claimNewCardDay(USER_ID, 'lexis', TODAY)).toEqual(TOMORROW);
      expect(redis.store.get(redis.key('2026-04-29'))).toBe(5);
      expect(redis.store.get(redis.key('2026-04-30'))).toBe(1);
    });

    it('skips every spent day up to the first with room', async () => {
      const redis = counters({ '2026-04-29': 5, '2026-04-30': 5, '2026-05-01': 7 });
      const { policy } = makePolicy({ newLimit: 5, ...redis } as any);

      expect(await policy.claimNewCardDay(USER_ID, 'lexis', TODAY)).toEqual(IN_3_DAYS);
    });

    it('reads the whole horizon in one call', async () => {
      const redis = counters({});
      const { policy } = makePolicy({ ...redis } as any);

      await policy.claimNewCardDay(USER_ID, 'lexis', TODAY);

      expect(redis.redisMget).toHaveBeenCalledTimes(1);
    });

    it('gives the slot back and moves on when a race took the last one', async () => {
      // The read saw room on today, but by the INCR another introduction had taken it.
      const redis = counters({ '2026-04-29': 5 });
      redis.redisMget.mockImplementationOnce(async (...keys: string[]) =>
        keys.map((k, i) => (i === 0 ? '4' : null)),
      );
      const { policy } = makePolicy({ newLimit: 5, ...redis } as any);

      expect(await policy.claimNewCardDay(USER_ID, 'lexis', TODAY)).toEqual(TOMORROW);
      expect(redis.store.get(redis.key('2026-04-29'))).toBe(5);
    });

    it('keeps a later day s counter alive until that day ends', async () => {
      const redis = counters({ '2026-04-29': 5 });
      const expire = jest.fn<() => Promise<number>>().mockResolvedValue(1);
      const { policy } = makePolicy({ newLimit: 5, ...redis, redisExpire: expire } as any);

      await policy.claimNewCardDay(USER_ID, 'lexis', TODAY);

      // 14:00 today → midnight at the end of tomorrow: 10 h + 24 h.
      expect(expire).toHaveBeenCalledWith(redis.key('2026-04-30'), 34 * 60 * 60);
    });

    it('charges the track s own counter', async () => {
      const incr = jest.fn<() => Promise<number>>().mockResolvedValue(1);
      const { policy } = makePolicy({ redisIncr: incr });

      await policy.claimNewCardDay(USER_ID, 'grammar', TODAY);

      expect(incr).toHaveBeenCalledWith(`srs:limits:${USER_ID}:grammar:new:2026-04-29`);
    });

    it('fails open to today when Redis is unavailable', async () => {
      const { policy } = makePolicy({ clientNull: true });
      expect(await policy.claimNewCardDay(USER_ID, 'lexis', TODAY)).toEqual(TODAY_START);
    });

    it('fails open to today when Redis errors', async () => {
      const mget = jest.fn<() => Promise<never>>().mockRejectedValue(new Error('down'));
      const { policy } = makePolicy({ redisMget: mget });
      expect(await policy.claimNewCardDay(USER_ID, 'lexis', TODAY)).toEqual(TODAY_START);
    });
  });

  describe('canReview', () => {
    it('returns true when below the review limit', async () => {
      const { policy } = makePolicy({ redisGet: jest.fn<() => Promise<string>>().mockResolvedValue('2') });
      expect(await policy.canReview(USER_ID, 'lexis', TODAY)).toBe(true);
    });

    it('returns false when at the review limit', async () => {
      const { policy } = makePolicy({
        reviewLimit: 10,
        redisGet: jest.fn<() => Promise<string>>().mockResolvedValue('10'),
      });
      expect(await policy.canReview(USER_ID, 'lexis', TODAY)).toBe(false);
    });
  });

  describe('incrementReviewCount', () => {
    it('calls INCR on the correct key and sets TTL on first increment', async () => {
      const incr   = jest.fn<() => Promise<number>>().mockResolvedValue(1);
      const expire = jest.fn<() => Promise<number>>().mockResolvedValue(1);
      const { policy } = makePolicy({ redisIncr: incr, redisExpire: expire });

      await policy.incrementReviewCount(USER_ID, 'lexis', TODAY);

      expect(incr).toHaveBeenCalledWith(`srs:limits:${USER_ID}:lexis:reviews:2026-04-29`);
      // 14:00 → midnight UTC.
      expect(expire).toHaveBeenCalledWith(expect.any(String), 10 * 60 * 60);
    });

    it('does not call EXPIRE when counter is already > 1', async () => {
      const incr   = jest.fn<() => Promise<number>>().mockResolvedValue(3);
      const expire = jest.fn<() => Promise<number>>().mockResolvedValue(1);
      const { policy } = makePolicy({ redisIncr: incr, redisExpire: expire });

      await policy.incrementReviewCount(USER_ID, 'lexis', TODAY);

      expect(expire).not.toHaveBeenCalled();
    });
  });

  describe('recordRefusal', () => {
    it('counts refusals on their own key, not the one that let work through', async () => {
      const incr = jest.fn<() => Promise<number>>().mockResolvedValue(1);
      const { policy } = makePolicy({ redisIncr: incr });

      await policy.claimNewCardDay(USER_ID, 'lexis', TODAY);
      await policy.recordRefusal(USER_ID, 'new', 'lexis', TODAY);
      await policy.recordRefusal(USER_ID, 'review', 'lexis', TODAY);

      const [allowedKey, refusedNewKey, refusedReviewKey] = incr.mock.calls.map(
        (call) => (call as string[])[0],
      );
      expect(allowedKey).toBe(`srs:limits:${USER_ID}:lexis:new:2026-04-29`);
      expect(refusedNewKey).toBe(`srs:limits:${USER_ID}:lexis:refused:new:2026-04-29`);
      expect(refusedReviewKey).toBe(`srs:limits:${USER_ID}:lexis:refused:reviews:2026-04-29`);
    });

    it('does not throw when Redis is unavailable', async () => {
      const { policy } = makePolicy({ clientNull: true });
      await expect(policy.recordRefusal(USER_ID, 'new', 'lexis', TODAY)).resolves.toBeUndefined();
    });
  });

  describe('new and review counters', () => {
    it('use different keys', async () => {
      const incr = jest.fn<() => Promise<number>>().mockResolvedValue(1);
      const { policy } = makePolicy({ redisIncr: incr });

      await policy.claimNewCardDay(USER_ID, 'lexis', TODAY);
      await policy.incrementReviewCount(USER_ID, 'lexis', TODAY);

      const newKey    = (incr.mock.calls[0] as string[])[0];
      const reviewKey = (incr.mock.calls[1] as string[])[0];
      expect(newKey).not.toBe(reviewKey);
      expect(newKey).toContain('new');
      expect(reviewKey).toContain('reviews');
    });
  });

  // Plan 63 phase 6 — the budgets are per track, and the point of splitting them is
  // that spending one does not spend the other.
  describe('tracks have separate budgets', () => {
    it('counts each track on its own key', async () => {
      const incr = jest.fn<() => Promise<number>>().mockResolvedValue(1);
      const { policy } = makePolicy({ redisIncr: incr });

      await policy.claimNewCardDay(USER_ID, 'lexis', TODAY);
      await policy.claimNewCardDay(USER_ID, 'grammar', TODAY);

      const keys = incr.mock.calls.map((call) => (call as string[])[0]);
      expect(keys).toEqual([
        `srs:limits:${USER_ID}:lexis:new:2026-04-29`,
        `srs:limits:${USER_ID}:grammar:new:2026-04-29`,
      ]);
    });

    it('gives grammar today on a day the lexical budget is spent', async () => {
      // The lexical counter is at its cap; the grammar one has not been touched. Reading
      // one key for both would push both to tomorrow.
      const mget = jest.fn(async (...keys: string[]) =>
        keys.map((k) => (k.includes(':lexis:') ? '5' : null)),
      );
      const { policy } = makePolicy({ newLimit: 5, redisMget: mget as any });

      expect(await policy.claimNewCardDay(USER_ID, 'lexis', TODAY)).not.toEqual(
        new Date('2026-04-29T00:00:00Z'),
      );
      expect(await policy.claimNewCardDay(USER_ID, 'grammar', TODAY)).toEqual(
        new Date('2026-04-29T00:00:00Z'),
      );
    });

    it('measures a track against its own cap, not the other one s', async () => {
      // Three on today's counters: under the lexical cap of five, over grammar's two.
      const mget = jest.fn(async (...keys: string[]) => keys.map((_, i) => (i === 0 ? '3' : null)));
      const incr = jest.fn<() => Promise<number>>().mockResolvedValue(1);
      const { policy } = makePolicy({ newLimit: 5, grammarNewLimit: 2, redisMget: mget as any, redisIncr: incr });

      expect(await policy.claimNewCardDay(USER_ID, 'lexis', TODAY)).toEqual(new Date('2026-04-29T00:00:00Z'));
      expect(await policy.claimNewCardDay(USER_ID, 'grammar', TODAY)).toEqual(new Date('2026-04-30T00:00:00Z'));
    });

    it('reports the day as a whole by summing the tracks, and one track when asked', async () => {
      const redisGet = jest.fn<(key: string) => Promise<string | null>>(async (key) =>
        key.includes(':lexis:') ? '7' : '3',
      );
      const { policy } = makePolicy({ redisGet: redisGet as any });

      expect(await policy.getReviewedCount(USER_ID, TODAY)).toBe(10);
      expect(await policy.getReviewedCount(USER_ID, TODAY, 'grammar')).toBe(3);
      // And the cap the count is shown against follows the same rule, so the pair is
      // always about the same thing.
      expect(policy.getDailyReviewLimit()).toBe(14);
      expect(policy.getDailyReviewLimit('grammar')).toBe(4);
    });
  });
});
