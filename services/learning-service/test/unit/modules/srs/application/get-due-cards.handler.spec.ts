import { jest } from '@jest/globals';
import { GetDueCardsHandler } from '../../../../../src/modules/srs/application/queries/get-due-cards.handler.js';
import { GetDueCardsQuery } from '../../../../../src/modules/srs/application/queries/get-due-cards.query.js';
import { ReviewCard } from '../../../../../src/modules/srs/domain/entities/review-card.entity.js';
import type { ISrsRepository } from '../../../../../src/modules/srs/domain/repositories/srs-repository.interface.js';
import type { IClock } from '../../../../../src/shared/application/ports/clock.port.js';
import type { RedisDueQueueService } from '../../../../../src/modules/srs/infrastructure/cache/redis-due-queue.service.js';

const NOW        = new Date('2026-04-29T10:00:00Z');
const USER_ID    = 'c3254eb9-3fb3-4559-9dbf-2cea12f40ed5';
const CONTENT_ID = 'eb1aa566-c4e0-4ffa-8018-e9ce2abc5d08';

function makeCards(n: number): ReviewCard[] {
  return Array.from({ length: n }, () => ReviewCard.create(USER_ID, 'EXERCISE', CONTENT_ID, NOW));
}

function makeHandler(overrides: {
  cachedIds?: string[] | null;
  dbCards?: ReviewCard[];
} = {}) {
  const cachedIds = overrides.cachedIds !== undefined ? overrides.cachedIds : null;
  const dbCards   = overrides.dbCards ?? [];

  const cardMap = new Map(dbCards.map((c) => [c.id, c]));

  const repo: ISrsRepository = {
    findById: jest.fn<(id: string) => Promise<ReviewCard | null>>().mockImplementation(
      (id: string) => Promise.resolve(cardMap.get(id) ?? null),
    ),
    findByUserAndContent: jest.fn(),
    findDueCards: jest.fn<() => Promise<ReviewCard[]>>().mockResolvedValue(dbCards),
    save: jest.fn(),
    countNewToday: jest.fn(),
    countReviewedToday: jest.fn(),
    getStatsByUser: jest.fn(),
  } as any;

  const clock: IClock = { now: () => NOW };

  const dueQueue = {
    getDueCardIds: jest.fn<() => Promise<string[] | null>>().mockResolvedValue(cachedIds),
    populate:      jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    upsert:        jest.fn(),
    invalidate:    jest.fn(),
  } as unknown as RedisDueQueueService;

  return {
    handler: new GetDueCardsHandler(repo, clock, dueQueue),
    repo,
    dueQueue,
  };
}

describe('GetDueCardsHandler', () => {
  it('returns cards from DB by cached IDs on cache hit', async () => {
    const cards = makeCards(2);
    const { handler, repo, dueQueue } = makeHandler({
      cachedIds: cards.map((c) => c.id),
      dbCards: cards,
    });

    const result = await handler.execute(new GetDueCardsQuery(USER_ID, 20));

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe(cards[0].id);
    expect(result[1].id).toBe(cards[1].id);
    expect(repo.findById).toHaveBeenCalledTimes(2);
    expect(repo.findDueCards).not.toHaveBeenCalled();
    expect(dueQueue.populate).not.toHaveBeenCalled();
  });

  it('filters out IDs that no longer exist in DB on cache hit', async () => {
    const [card] = makeCards(1);
    const { handler, repo } = makeHandler({
      cachedIds: [card.id, 'stale-id-not-in-db'],
      dbCards: [card],
    });

    const result = await handler.execute(new GetDueCardsQuery(USER_ID, 20));

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(card.id);
    expect(repo.findById).toHaveBeenCalledTimes(2);
  });

  it('queries DB and populates cache on cache miss', async () => {
    const cards = makeCards(3);
    const { handler, repo, dueQueue } = makeHandler({
      cachedIds: null, // cache miss
      dbCards: cards,
    });

    const result = await handler.execute(new GetDueCardsQuery(USER_ID, 20));

    expect(result).toHaveLength(3);
    expect(repo.findDueCards).toHaveBeenCalledWith(USER_ID, 20, NOW);
    expect(dueQueue.populate).toHaveBeenCalledWith(
      USER_ID,
      expect.arrayContaining([{ id: cards[0].id, dueAt: expect.any(Date) }]),
    );
    expect(repo.findById).not.toHaveBeenCalled();
  });

  it('does not call populate when DB returns empty list', async () => {
    const { handler, dueQueue } = makeHandler({ cachedIds: null, dbCards: [] });

    const result = await handler.execute(new GetDueCardsQuery(USER_ID, 20));

    expect(result).toHaveLength(0);
    expect(dueQueue.populate).not.toHaveBeenCalled();
  });

  it('returns empty array on cache hit with empty ID list', async () => {
    const { handler, repo } = makeHandler({ cachedIds: [] });

    const result = await handler.execute(new GetDueCardsQuery(USER_ID, 20));

    expect(result).toHaveLength(0);
    expect(repo.findById).not.toHaveBeenCalled();
    expect(repo.findDueCards).not.toHaveBeenCalled();
  });
});
