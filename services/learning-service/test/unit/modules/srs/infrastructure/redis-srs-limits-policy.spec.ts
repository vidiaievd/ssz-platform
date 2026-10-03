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
  clientNull?: boolean;
} = {}) {
  const client = overrides.clientNull ? null : {
    get:    overrides.redisGet    ?? jest.fn<() => Promise<null>>().mockResolvedValue(null),
    incr:   overrides.redisIncr   ?? jest.fn<() => Promise<number>>().mockResolvedValue(1),
    expire: overrides.redisExpire ?? jest.fn<() => Promise<number>>().mockResolvedValue(1),
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
  describe('canIntroduceNewCard', () => {
    it('returns true when current count is below the limit', async () => {
      const { policy } = makePolicy({ redisGet: jest.fn<() => Promise<string>>().mockResolvedValue('3') });
      expect(await policy.canIntroduceNewCard(USER_ID, 'lexis', TODAY)).toBe(true);
    });

    it('returns false when current count equals the limit', async () => {
      const { policy } = makePolicy({
        newLimit: 5,
        redisGet: jest.fn<() => Promise<string>>().mockResolvedValue('5'),
      });
      expect(await policy.canIntroduceNewCard(USER_ID, 'lexis', TODAY)).toBe(false);
    });

    it('returns false when count exceeds the limit', async () => {
      const { policy } = makePolicy({
        newLimit: 5,
        redisGet: jest.fn<() => Promise<string>>().mockResolvedValue('7'),
      });
      expect(await policy.canIntroduceNewCard(USER_ID, 'lexis', TODAY)).toBe(false);
    });

    it('returns true when key does not exist (count = 0)', async () => {
      const { policy } = makePolicy({ redisGet: jest.fn<() => Promise<null>>().mockResolvedValue(null) });
      expect(await policy.canIntroduceNewCard(USER_ID, 'lexis', TODAY)).toBe(true);
    });

    it('fails open (returns true) when Redis client is unavailable', async () => {
      const { policy } = makePolicy({ clientNull: true });
      expect(await policy.canIntroduceNewCard(USER_ID, 'lexis', TODAY)).toBe(true);
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

  describe('incrementNewCardCount', () => {
    it('calls INCR on the correct key and sets TTL on first increment', async () => {
      const incr   = jest.fn<() => Promise<number>>().mockResolvedValue(1);
      const expire = jest.fn<() => Promise<number>>().mockResolvedValue(1);
      const { policy } = makePolicy({ redisIncr: incr, redisExpire: expire });

      await policy.incrementNewCardCount(USER_ID, 'lexis', TODAY);

      expect(incr).toHaveBeenCalledTimes(1);
      const key: string = (incr.mock.calls[0] as string[])[0];
      expect(key).toContain(USER_ID);
      expect(key).toContain('new');
      expect(key).toContain('2026-04-29'); // UTC date
      expect(expire).toHaveBeenCalledTimes(1); // TTL set on first increment
    });

    it('does not call EXPIRE when counter is already > 1', async () => {
      const incr   = jest.fn<() => Promise<number>>().mockResolvedValue(3);
      const expire = jest.fn<() => Promise<number>>().mockResolvedValue(1);
      const { policy } = makePolicy({ redisIncr: incr, redisExpire: expire });

      await policy.incrementNewCardCount(USER_ID, 'lexis', TODAY);

      expect(expire).not.toHaveBeenCalled();
    });
  });

  describe('recordRefusal', () => {
    it('counts refusals on their own key, not the one that let work through', async () => {
      const incr = jest.fn<() => Promise<number>>().mockResolvedValue(1);
      const { policy } = makePolicy({ redisIncr: incr });

      await policy.incrementNewCardCount(USER_ID, 'lexis', TODAY);
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

  describe('incrementReviewCount', () => {
    it('uses a different key from incrementNewCardCount', async () => {
      const incr = jest.fn<() => Promise<number>>().mockResolvedValue(1);
      const { policy } = makePolicy({ redisIncr: incr });

      await policy.incrementNewCardCount(USER_ID, 'lexis', TODAY);
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

      await policy.incrementNewCardCount(USER_ID, 'lexis', TODAY);
      await policy.incrementNewCardCount(USER_ID, 'grammar', TODAY);

      const keys = incr.mock.calls.map((call) => (call as string[])[0]);
      expect(keys).toEqual([
        `srs:limits:${USER_ID}:lexis:new:2026-04-29`,
        `srs:limits:${USER_ID}:grammar:new:2026-04-29`,
      ]);
    });

    it('still introduces grammar cards on a day the lexical budget is spent', async () => {
      // The lexical counter is at its cap; the grammar one has not been touched. Reading
      // one key for both would answer "no" to both.
      const redisGet = jest.fn<(key: string) => Promise<string | null>>(async (key) =>
        key.includes(':lexis:') ? '5' : null,
      );
      const { policy } = makePolicy({ newLimit: 5, redisGet: redisGet as any });

      expect(await policy.canIntroduceNewCard(USER_ID, 'lexis', TODAY)).toBe(false);
      expect(await policy.canIntroduceNewCard(USER_ID, 'grammar', TODAY)).toBe(true);
    });

    it('refuses against the track’s own cap, not the other one’s', async () => {
      // Three grammar cards on a cap of two, where the lexical cap of five would allow it.
      const redisGet = jest.fn<() => Promise<string>>().mockResolvedValue('3');
      const { policy } = makePolicy({ newLimit: 5, grammarNewLimit: 2, redisGet });

      expect(await policy.canIntroduceNewCard(USER_ID, 'lexis', TODAY)).toBe(true);
      expect(await policy.canIntroduceNewCard(USER_ID, 'grammar', TODAY)).toBe(false);
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
