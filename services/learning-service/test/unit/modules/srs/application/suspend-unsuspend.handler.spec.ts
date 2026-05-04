import { jest } from '@jest/globals';
import { SuspendCardHandler } from '../../../../../src/modules/srs/application/commands/suspend-card.handler.js';
import { UnsuspendCardHandler } from '../../../../../src/modules/srs/application/commands/unsuspend-card.handler.js';
import { SuspendCardCommand } from '../../../../../src/modules/srs/application/commands/suspend-card.command.js';
import { UnsuspendCardCommand } from '../../../../../src/modules/srs/application/commands/unsuspend-card.command.js';
import {
  SrsCardNotFoundError,
  SrsCardUnauthorizedError,
} from '../../../../../src/modules/srs/application/errors/srs-application.errors.js';
import { ReviewCard } from '../../../../../src/modules/srs/domain/entities/review-card.entity.js';
import type { ISrsRepository } from '../../../../../src/modules/srs/domain/repositories/srs-repository.interface.js';
import type { IEventPublisher } from '../../../../../src/shared/application/ports/event-publisher.port.js';
import type { IClock } from '../../../../../src/shared/application/ports/clock.port.js';
import type { RedisDueQueueService } from '../../../../../src/modules/srs/infrastructure/cache/redis-due-queue.service.js';

const NOW      = new Date('2026-04-29T10:00:00Z');
const USER_ID  = 'c3254eb9-3fb3-4559-9dbf-2cea12f40ed5';
const OTHER_ID = 'aaaaaaaa-bbbb-4000-8000-000000000001';
const CONTENT_ID = 'eb1aa566-c4e0-4ffa-8018-e9ce2abc5d08';

function makeCard(userId = USER_ID): ReviewCard {
  return ReviewCard.create(userId, 'EXERCISE', CONTENT_ID, NOW);
}

function makeDeps(card: ReviewCard | null) {
  const repo: ISrsRepository = {
    findById: jest.fn<() => Promise<ReviewCard | null>>().mockResolvedValue(card),
    findByUserAndContent: jest.fn(),
    findDueCards: jest.fn(),
    save: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    countNewToday: jest.fn(),
    countReviewedToday: jest.fn(),
    getStatsByUser: jest.fn(),
  } as any;
  const publisher: IEventPublisher = { publish: jest.fn<() => Promise<void>>().mockResolvedValue(undefined) };
  const clock: IClock = { now: () => NOW };
  const dueQueue = {
    invalidate: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    upsert:     jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  } as unknown as RedisDueQueueService;
  return { repo, publisher, clock, dueQueue };
}

describe('SuspendCardHandler', () => {
  it('suspends card, invalidates due queue, publishes event', async () => {
    const card = makeCard();
    const { repo, publisher, clock, dueQueue } = makeDeps(card);
    const handler = new SuspendCardHandler(repo, publisher, clock, dueQueue);

    const result = await handler.execute(new SuspendCardCommand(USER_ID, card.id));

    expect(result.isOk).toBe(true);
    expect(result.value.state).toBe('SUSPENDED');
    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(dueQueue.invalidate).toHaveBeenCalledWith(USER_ID);
    expect(publisher.publish).toHaveBeenCalledWith('learning.srs.card.suspended', expect.any(Object));
  });

  it('returns SrsCardNotFoundError when card does not exist', async () => {
    const { repo, publisher, clock, dueQueue } = makeDeps(null);
    const handler = new SuspendCardHandler(repo, publisher, clock, dueQueue);
    const result = await handler.execute(new SuspendCardCommand(USER_ID, 'missing'));
    expect(result.isFail).toBe(true);
    expect(result.error).toBeInstanceOf(SrsCardNotFoundError);
  });

  it('returns SrsCardUnauthorizedError when card belongs to another user', async () => {
    const card = makeCard(OTHER_ID);
    const { repo, publisher, clock, dueQueue } = makeDeps(card);
    const handler = new SuspendCardHandler(repo, publisher, clock, dueQueue);
    const result = await handler.execute(new SuspendCardCommand(USER_ID, card.id));
    expect(result.isFail).toBe(true);
    expect(result.error).toBeInstanceOf(SrsCardUnauthorizedError);
  });
});

describe('UnsuspendCardHandler', () => {
  it('unsuspends card, adds to due queue, publishes event', async () => {
    const card = makeCard();
    card.suspend(NOW);
    card.clearDomainEvents();
    const { repo, publisher, clock, dueQueue } = makeDeps(card);
    const handler = new UnsuspendCardHandler(repo, publisher, clock, dueQueue);

    const result = await handler.execute(new UnsuspendCardCommand(USER_ID, card.id));

    expect(result.isOk).toBe(true);
    expect(result.value.state).toBe('REVIEW');
    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(dueQueue.upsert).toHaveBeenCalledWith(USER_ID, card.id, expect.any(Date));
    expect(publisher.publish).toHaveBeenCalledWith('learning.srs.card.suspended', expect.any(Object));
  });

  it('returns SrsCardNotFoundError when card does not exist', async () => {
    const { repo, publisher, clock, dueQueue } = makeDeps(null);
    const handler = new UnsuspendCardHandler(repo, publisher, clock, dueQueue);
    const result = await handler.execute(new UnsuspendCardCommand(USER_ID, 'missing'));
    expect(result.isFail).toBe(true);
    expect(result.error).toBeInstanceOf(SrsCardNotFoundError);
  });
});
