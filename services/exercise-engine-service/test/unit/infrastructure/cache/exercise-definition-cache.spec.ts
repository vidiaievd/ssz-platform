import { jest } from '@jest/globals';
import { ExerciseDefinitionCache } from '../../../../src/infrastructure/cache/exercise-definition-cache.js';
import type { ExerciseDefinition } from '../../../../src/shared/application/ports/content-client.port.js';

const stubDef: ExerciseDefinition = {
  exercise: {
    id: 'ex-1',
    templateCode: 'multiple_choice',
    targetLanguage: 'no',
    difficultyLevel: 'B1',
    content: { question: 'Q?' },
    expectedAnswers: { correct_option_ids: ['A'] },
    answerCheckSettings: null,
  },
  template: {
    code: 'multiple_choice',
    contentSchema: {},
    answerSchema: {},
    defaultCheckSettings: {},
    supportedLanguages: null,
  },
  instruction: null,
};

const makeRedisClient = () => ({
  get: jest.fn<() => Promise<string | null>>(),
  set: jest.fn<() => Promise<'OK'>>(),
  del: jest.fn<() => Promise<number>>(),
  scan: jest.fn<() => Promise<[string, string[]]>>(),
});

const makeConfig = (ttl = 300, prefix = 'exercise-engine:') => ({
  get: jest.fn().mockImplementation((key: string) => {
    if (key === 'cache') return { exerciseDefinitionTtlSeconds: ttl };
    if (key === 'redis') return { keyPrefix: prefix };
    return undefined;
  }),
});

const makeCache = (redisClient: ReturnType<typeof makeRedisClient>, config = makeConfig()) => {
  const redisService = { getClient: () => redisClient } as any;
  return new ExerciseDefinitionCache(redisService, config as any);
};

describe('ExerciseDefinitionCache', () => {
  describe('get()', () => {
    it('returns null when Redis client is not available', async () => {
      const redisService = { getClient: () => null } as any;
      const cache = new ExerciseDefinitionCache(redisService, makeConfig() as any);
      expect(await cache.get('ex-1', 'no')).toBeNull();
    });

    it('returns null on cache miss', async () => {
      const client = makeRedisClient();
      client.get.mockResolvedValue(null);
      const cache = makeCache(client);
      expect(await cache.get('ex-1', 'no')).toBeNull();
      expect(client.get).toHaveBeenCalledWith('exercise-def:ex-1:no');
    });

    it('returns parsed definition on cache hit', async () => {
      const client = makeRedisClient();
      client.get.mockResolvedValue(JSON.stringify(stubDef));
      const cache = makeCache(client);
      const result = await cache.get('ex-1', 'no');
      expect(result).toEqual(stubDef);
    });

    it('returns null when cached value is malformed JSON', async () => {
      const client = makeRedisClient();
      client.get.mockResolvedValue('not-json');
      const cache = makeCache(client);
      expect(await cache.get('ex-1', 'no')).toBeNull();
    });
  });

  describe('set()', () => {
    it('stores serialized value with correct key and TTL', async () => {
      const client = makeRedisClient();
      client.set.mockResolvedValue('OK');
      const cache = makeCache(client, makeConfig(300));
      await cache.set('ex-1', 'no', stubDef);
      expect(client.set).toHaveBeenCalledWith(
        'exercise-def:ex-1:no',
        JSON.stringify(stubDef),
        'EX',
        300,
      );
    });

    it('does nothing when Redis client is not available', async () => {
      const redisService = { getClient: () => null } as any;
      const cache = new ExerciseDefinitionCache(redisService, makeConfig() as any);
      await expect(cache.set('ex-1', 'no', stubDef)).resolves.toBeUndefined();
    });
  });

  describe('invalidate()', () => {
    it('does nothing when Redis client is not available', async () => {
      const redisService = { getClient: () => null } as any;
      const cache = new ExerciseDefinitionCache(redisService, makeConfig() as any);
      await expect(cache.invalidate('ex-1')).resolves.toBeUndefined();
    });

    it('uses SCAN with prefixed pattern and DELetes stripped keys', async () => {
      const client = makeRedisClient();
      // First SCAN page returns two keys; cursor '0' signals end of iteration.
      client.scan.mockResolvedValueOnce([
        '0',
        ['exercise-engine:exercise-def:ex-1:no', 'exercise-engine:exercise-def:ex-1:en'],
      ]);
      client.del.mockResolvedValue(2);
      const cache = makeCache(client, makeConfig(300, 'exercise-engine:'));

      await cache.invalidate('ex-1');

      expect(client.scan).toHaveBeenCalledWith(
        '0',
        'MATCH',
        'exercise-engine:exercise-def:ex-1:*',
        'COUNT',
        100,
      );
      // Keys passed to DEL must have prefix stripped (DEL auto-adds it).
      expect(client.del).toHaveBeenCalledWith(
        'exercise-def:ex-1:no',
        'exercise-def:ex-1:en',
      );
    });

    it('iterates multiple SCAN pages until cursor is 0', async () => {
      const client = makeRedisClient();
      client.scan
        .mockResolvedValueOnce(['42', ['exercise-engine:exercise-def:ex-1:no']])
        .mockResolvedValueOnce(['0', ['exercise-engine:exercise-def:ex-1:de']]);
      client.del.mockResolvedValue(1);
      const cache = makeCache(client);

      await cache.invalidate('ex-1');

      expect(client.scan).toHaveBeenCalledTimes(2);
      expect(client.del).toHaveBeenCalledTimes(2);
    });

    it('skips DEL when no keys match', async () => {
      const client = makeRedisClient();
      client.scan.mockResolvedValueOnce(['0', []]);
      const cache = makeCache(client);

      await cache.invalidate('ex-1');

      expect(client.del).not.toHaveBeenCalled();
    });
  });
});
