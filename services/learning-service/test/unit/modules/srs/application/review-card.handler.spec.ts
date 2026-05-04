import { jest } from '@jest/globals';
import { ReviewCardHandler } from '../../../../../src/modules/srs/application/commands/review-card.handler.js';
import { ReviewCardCommand } from '../../../../../src/modules/srs/application/commands/review-card.command.js';
import {
  SrsCardNotFoundError,
  SrsCardUnauthorizedError,
  SrsCardSuspendedError,
  SrsReviewLimitError,
} from '../../../../../src/modules/srs/application/errors/srs-application.errors.js';
import { ReviewCard, type SchedulingResult } from '../../../../../src/modules/srs/domain/entities/review-card.entity.js';
import type { ISrsRepository } from '../../../../../src/modules/srs/domain/repositories/srs-repository.interface.js';
import type { ISrsScheduler } from '../../../../../src/modules/srs/application/ports/srs-scheduler.port.js';
import type { ISrsLimitsPolicy } from '../../../../../src/modules/srs/application/ports/srs-limits-policy.port.js';
import type { IEventPublisher } from '../../../../../src/shared/application/ports/event-publisher.port.js';
import type { IClock } from '../../../../../src/shared/application/ports/clock.port.js';
import type { RedisDueQueueService } from '../../../../../src/modules/srs/infrastructure/cache/redis-due-queue.service.js';

const NOW        = new Date('2026-04-29T10:00:00Z');
const LATER      = new Date('2026-05-06T10:00:00Z');
const USER_ID    = 'c3254eb9-3fb3-4559-9dbf-2cea12f40ed5';
const OTHER_ID   = 'aaaaaaaa-bbbb-4000-8000-000000000001';
const CONTENT_ID = 'eb1aa566-c4e0-4ffa-8018-e9ce2abc5d08';

function makeCard(state: ReviewCard['state'] = 'REVIEW'): ReviewCard {
  const card = ReviewCard.create(USER_ID, 'EXERCISE', CONTENT_ID, NOW);
  if (state !== 'NEW') {
    // Reconstitute with the desired state
    return ReviewCard.reconstitute({
      id: card.id,
      userId: USER_ID,
      contentType: 'EXERCISE',
      contentId: CONTENT_ID,
      state,
      dueAt: NOW,
      stability: 5.0,
      difficulty: 5.0,
      elapsedDays: 5,
      scheduledDays: 5,
      reps: 2,
      lapses: 0,
      learningSteps: 0,
      lastReviewedAt: new Date('2026-04-24T10:00:00Z'),
      createdAt: NOW,
      updatedAt: NOW,
    });
  }
  return card;
}

const mockSchedulingResult: SchedulingResult = {
  state: 'REVIEW',
  dueAt: LATER,
  stability: 8.5,
  difficulty: 5.0,
  elapsedDays: 5,
  scheduledDays: 7,
  learningSteps: 0,
};

function makeHandler(overrides: {
  card?: ReviewCard | null;
  canReview?: boolean;
  schedResult?: SchedulingResult;
} = {}) {
  const card = overrides.card !== undefined ? overrides.card : makeCard();

  const repo: ISrsRepository = {
    findById: jest.fn<() => Promise<ReviewCard | null>>().mockResolvedValue(card),
    findByUserAndContent: jest.fn(),
    findDueCards: jest.fn(),
    save: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    countNewToday: jest.fn(),
    countReviewedToday: jest.fn(),
    getStatsByUser: jest.fn(),
  } as any;

  const scheduler: ISrsScheduler = {
    schedule: jest.fn().mockReturnValue(overrides.schedResult ?? mockSchedulingResult),
  } as any;

  const limitsPolicy: ISrsLimitsPolicy = {
    canIntroduceNewCard: jest.fn(),
    canReview: jest.fn<() => Promise<boolean>>().mockResolvedValue(overrides.canReview ?? true),
    incrementNewCardCount: jest.fn(),
    incrementReviewCount: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  } as any;

  const publisher: IEventPublisher = {
    publish: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };

  const clock: IClock = { now: () => NOW };

  const dueQueue = {
    upsert: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  } as unknown as RedisDueQueueService;

  return {
    handler: new ReviewCardHandler(repo, scheduler, limitsPolicy, publisher, clock, dueQueue),
    repo,
    scheduler,
    limitsPolicy,
    publisher,
    dueQueue,
  };
}

function cmd(cardId: string = '00000000-0000-4000-8000-000000000001') {
  return new ReviewCardCommand(USER_ID, cardId, 'GOOD');
}

describe('ReviewCardHandler', () => {
  it('applies scheduling, saves, increments review count, and returns updated card', async () => {
    const card = makeCard('REVIEW');
    const { handler, repo, limitsPolicy, dueQueue } = makeHandler({ card });

    const result = await handler.execute(cmd(card.id));

    expect(result.isOk).toBe(true);
    expect(result.value.state).toBe('REVIEW');
    expect(result.value.dueAt).toBe(LATER.toISOString());
    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(limitsPolicy.incrementReviewCount).toHaveBeenCalledTimes(1);
    expect(dueQueue.upsert).toHaveBeenCalledTimes(1);
  });

  it('publishes ReviewCardReviewedEvent', async () => {
    const card = makeCard('REVIEW');
    const { handler, publisher } = makeHandler({ card });

    await handler.execute(cmd(card.id));

    expect(publisher.publish).toHaveBeenCalledWith(
      'learning.srs.card.reviewed',
      expect.any(Object),
    );
  });

  it('fails with SrsCardNotFoundError when card does not exist', async () => {
    const { handler } = makeHandler({ card: null });
    const result = await handler.execute(cmd('nonexistent-id'));
    expect(result.isFail).toBe(true);
    expect(result.error).toBeInstanceOf(SrsCardNotFoundError);
  });

  it('fails with SrsCardUnauthorizedError when card belongs to another user', async () => {
    const card = ReviewCard.reconstitute({
      id: '00000000-0000-4000-8000-000000000001',
      userId: OTHER_ID,  // different user
      contentType: 'EXERCISE',
      contentId: CONTENT_ID,
      state: 'REVIEW',
      dueAt: NOW,
      stability: 5,
      difficulty: 5,
      elapsedDays: 5,
      scheduledDays: 5,
      reps: 1,
      lapses: 0,
      learningSteps: 0,
      lastReviewedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    });
    const { handler } = makeHandler({ card });
    const result = await handler.execute(cmd(card.id));
    expect(result.isFail).toBe(true);
    expect(result.error).toBeInstanceOf(SrsCardUnauthorizedError);
  });

  it('fails with SrsReviewLimitError when daily review cap is reached', async () => {
    const card = makeCard('REVIEW');
    const { handler } = makeHandler({ card, canReview: false });
    const result = await handler.execute(cmd(card.id));
    expect(result.isFail).toBe(true);
    expect(result.error).toBeInstanceOf(SrsReviewLimitError);
  });

  it('fails with SrsCardSuspendedError for a suspended card', async () => {
    const card = makeCard('SUSPENDED');
    const { handler } = makeHandler({ card });
    const result = await handler.execute(cmd(card.id));
    expect(result.isFail).toBe(true);
    expect(result.error).toBeInstanceOf(SrsCardSuspendedError);
  });
});
