import { jest } from '@jest/globals';
import { RedisContainerItemListCache, DEFAULT_TTL_SECONDS } from '../../../../src/infrastructure/cache/container-item-list-cache.service.js';
import { ContentRef } from '../../../../src/shared/domain/value-objects/content-ref.js';
import type { RedisService } from '../../../../src/infrastructure/cache/redis.service.js';

const CONTAINER_ID = 'cccccccc-0000-4000-8000-000000000001';

const ref1 = ContentRef.fromPersistence('LESSON', 'aaaaaaaa-0000-4000-8000-000000000001');
const ref2 = ContentRef.fromPersistence('VOCABULARY_LIST', 'bbbbbbbb-0000-4000-8000-000000000002');

function makeRedisClient(overrides: Partial<{ get: any; set: any; del: any }> = {}) {
  return {
    get: overrides.get ?? jest.fn<() => Promise<string | null>>().mockResolvedValue(null),
    set: overrides.set ?? jest.fn<() => Promise<'OK'>>().mockResolvedValue('OK'),
    del: overrides.del ?? jest.fn<() => Promise<number>>().mockResolvedValue(1),
  };
}

function makeService(client: ReturnType<typeof makeRedisClient> | null) {
  const redisService = {
    getClient: jest.fn().mockReturnValue(client),
  } as unknown as RedisService;
  return new RedisContainerItemListCache(redisService);
}

describe('RedisContainerItemListCache', () => {
  describe('get', () => {
    it('returns null on cache miss', async () => {
      const client = makeRedisClient({ get: jest.fn<() => Promise<null>>().mockResolvedValue(null) });
      const cache = makeService(client);

      expect(await cache.get(CONTAINER_ID)).toBeNull();
      expect(client.get).toHaveBeenCalledWith(`container-items:${CONTAINER_ID}`);
    });

    it('returns parsed ContentRef[] on cache hit', async () => {
      const stored = JSON.stringify([
        { type: 'LESSON', id: 'aaaaaaaa-0000-4000-8000-000000000001' },
        { type: 'VOCABULARY_LIST', id: 'bbbbbbbb-0000-4000-8000-000000000002' },
      ]);
      const client = makeRedisClient({ get: jest.fn<() => Promise<string>>().mockResolvedValue(stored) });
      const cache = makeService(client);

      const result = await cache.get(CONTAINER_ID);

      expect(result).toHaveLength(2);
      expect(result![0].type).toBe('LESSON');
      expect(result![0].id).toBe('aaaaaaaa-0000-4000-8000-000000000001');
      expect(result![1].type).toBe('VOCABULARY_LIST');
    });

    it('returns null for corrupted entry (invalid ContentRef)', async () => {
      const corrupted = JSON.stringify([{ type: 'UNKNOWN_TYPE', id: 'not-a-uuid' }]);
      const client = makeRedisClient({ get: jest.fn<() => Promise<string>>().mockResolvedValue(corrupted) });
      const cache = makeService(client);

      expect(await cache.get(CONTAINER_ID)).toBeNull();
    });

    it('returns null when Redis client is unavailable', async () => {
      const cache = makeService(null);
      expect(await cache.get(CONTAINER_ID)).toBeNull();
    });

    it('returns null on Redis error (does not throw)', async () => {
      const client = makeRedisClient({ get: jest.fn().mockRejectedValue(new Error('connection refused')) });
      const cache = makeService(client);

      expect(await cache.get(CONTAINER_ID)).toBeNull();
    });
  });

  describe('set', () => {
    it('serialises refs to JSON and stores with default TTL', async () => {
      const client = makeRedisClient();
      const cache = makeService(client);

      await cache.set(CONTAINER_ID, [ref1, ref2]);

      expect(client.set).toHaveBeenCalledWith(
        `container-items:${CONTAINER_ID}`,
        JSON.stringify([
          { type: 'LESSON', id: 'aaaaaaaa-0000-4000-8000-000000000001' },
          { type: 'VOCABULARY_LIST', id: 'bbbbbbbb-0000-4000-8000-000000000002' },
        ]),
        'EX',
        DEFAULT_TTL_SECONDS,
      );
    });

    it('uses custom TTL when provided', async () => {
      const client = makeRedisClient();
      const cache = makeService(client);

      await cache.set(CONTAINER_ID, [ref1], 120);

      expect(client.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        'EX',
        120,
      );
    });

    it('does nothing when Redis client is unavailable', async () => {
      const cache = makeService(null);
      await expect(cache.set(CONTAINER_ID, [ref1])).resolves.toBeUndefined();
    });

    it('does not throw on Redis error', async () => {
      const client = makeRedisClient({ set: jest.fn().mockRejectedValue(new Error('timeout')) });
      const cache = makeService(client);

      await expect(cache.set(CONTAINER_ID, [ref1])).resolves.toBeUndefined();
    });
  });

  describe('invalidate', () => {
    it('deletes the cache key', async () => {
      const client = makeRedisClient();
      const cache = makeService(client);

      await cache.invalidate(CONTAINER_ID);

      expect(client.del).toHaveBeenCalledWith(`container-items:${CONTAINER_ID}`);
    });

    it('does nothing when Redis client is unavailable', async () => {
      const cache = makeService(null);
      await expect(cache.invalidate(CONTAINER_ID)).resolves.toBeUndefined();
    });

    it('does not throw on Redis error', async () => {
      const client = makeRedisClient({ del: jest.fn().mockRejectedValue(new Error('timeout')) });
      const cache = makeService(client);

      await expect(cache.invalidate(CONTAINER_ID)).resolves.toBeUndefined();
    });
  });
});
