import { jest } from '@jest/globals';
import { RedisSrsLimitsPolicy } from '../../../../../src/modules/srs/infrastructure/cache/redis-srs-limits-policy.js';

const USER_ID = 'c3254eb9-3fb3-4559-9dbf-2cea12f40ed5';
const TODAY   = new Date('2026-04-29T14:00:00Z');

function makePolicy(overrides: {
  newLimit?: number;
  reviewLimit?: number;
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
    }),
  } as any;

  return { policy: new RedisSrsLimitsPolicy(redis, config), client };
}

describe('RedisSrsLimitsPolicy', () => {
  describe('canIntroduceNewCard', () => {
    it('returns true when current count is below the limit', async () => {
      const { policy } = makePolicy({ redisGet: jest.fn<() => Promise<string>>().mockResolvedValue('3') });
      expect(await policy.canIntroduceNewCard(USER_ID, TODAY)).toBe(true);
    });

    it('returns false when current count equals the limit', async () => {
      const { policy } = makePolicy({
        newLimit: 5,
        redisGet: jest.fn<() => Promise<string>>().mockResolvedValue('5'),
      });
      expect(await policy.canIntroduceNewCard(USER_ID, TODAY)).toBe(false);
    });

    it('returns false when count exceeds the limit', async () => {
      const { policy } = makePolicy({
        newLimit: 5,
        redisGet: jest.fn<() => Promise<string>>().mockResolvedValue('7'),
      });
      expect(await policy.canIntroduceNewCard(USER_ID, TODAY)).toBe(false);
    });

    it('returns true when key does not exist (count = 0)', async () => {
      const { policy } = makePolicy({ redisGet: jest.fn<() => Promise<null>>().mockResolvedValue(null) });
      expect(await policy.canIntroduceNewCard(USER_ID, TODAY)).toBe(true);
    });

    it('fails open (returns true) when Redis client is unavailable', async () => {
      const { policy } = makePolicy({ clientNull: true });
      expect(await policy.canIntroduceNewCard(USER_ID, TODAY)).toBe(true);
    });
  });

  describe('canReview', () => {
    it('returns true when below the review limit', async () => {
      const { policy } = makePolicy({ redisGet: jest.fn<() => Promise<string>>().mockResolvedValue('2') });
      expect(await policy.canReview(USER_ID, TODAY)).toBe(true);
    });

    it('returns false when at the review limit', async () => {
      const { policy } = makePolicy({
        reviewLimit: 10,
        redisGet: jest.fn<() => Promise<string>>().mockResolvedValue('10'),
      });
      expect(await policy.canReview(USER_ID, TODAY)).toBe(false);
    });
  });

  describe('incrementNewCardCount', () => {
    it('calls INCR on the correct key and sets TTL on first increment', async () => {
      const incr   = jest.fn<() => Promise<number>>().mockResolvedValue(1);
      const expire = jest.fn<() => Promise<number>>().mockResolvedValue(1);
      const { policy } = makePolicy({ redisIncr: incr, redisExpire: expire });

      await policy.incrementNewCardCount(USER_ID, TODAY);

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

      await policy.incrementNewCardCount(USER_ID, TODAY);

      expect(expire).not.toHaveBeenCalled();
    });
  });

  describe('incrementReviewCount', () => {
    it('uses a different key from incrementNewCardCount', async () => {
      const incr = jest.fn<() => Promise<number>>().mockResolvedValue(1);
      const { policy } = makePolicy({ redisIncr: incr });

      await policy.incrementNewCardCount(USER_ID, TODAY);
      await policy.incrementReviewCount(USER_ID, TODAY);

      const newKey    = (incr.mock.calls[0] as string[])[0];
      const reviewKey = (incr.mock.calls[1] as string[])[0];
      expect(newKey).not.toBe(reviewKey);
      expect(newKey).toContain('new');
      expect(reviewKey).toContain('reviews');
    });
  });
});
