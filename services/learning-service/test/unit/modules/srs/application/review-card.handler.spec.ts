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
import type { RedisReviewIdempotencyService } from '../../../../../src/modules/srs/infrastructure/cache/redis-review-idempotency.service.js';

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
  claimed?: boolean;
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
    recordRefusal: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  } as any;

  const publisher: IEventPublisher = {
    publish: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };

  const clock: IClock = { now: () => NOW };

  const dueQueue = {
    upsert: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  } as unknown as RedisDueQueueService;

  const idempotency = {
    claim: jest.fn<() => Promise<boolean>>().mockResolvedValue(overrides.claimed ?? true),
    release: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  } as unknown as RedisReviewIdempotencyService;

  return {
    handler: new ReviewCardHandler(
      repo,
      scheduler,
      limitsPolicy,
      publisher,
      clock,
      dueQueue,
      idempotency,
    ),
    repo,
    scheduler,
    limitsPolicy,
    publisher,
    dueQueue,
    idempotency,
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

  describe('carrying on past the daily cap (plan 37 §B.1)', () => {
    function carryOn(cardId: string) {
      return new ReviewCardCommand(USER_ID, cardId, 'GOOD', undefined, undefined, true);
    }

    it('reviews the card even though the cap is spent', async () => {
      const card = makeCard('REVIEW');
      const { handler, repo, dueQueue } = makeHandler({ card, canReview: false });

      const result = await handler.execute(carryOn(card.id));

      expect(result.isOk).toBe(true);
      expect(result.value.dueAt).toBe(LATER.toISOString());
      expect(repo.save).toHaveBeenCalledTimes(1);
      expect(dueQueue.upsert).toHaveBeenCalledTimes(1);
    });

    it('keeps counting the reviews it lets through, so today’s total stays true', async () => {
      const card = makeCard('REVIEW');
      const { handler, limitsPolicy } = makeHandler({ card, canReview: false });

      await handler.execute(carryOn(card.id));

      expect(limitsPolicy.incrementReviewCount).toHaveBeenCalledTimes(1);
    });

    it('records no refusal — nothing was refused', async () => {
      const card = makeCard('REVIEW');
      const { handler, limitsPolicy } = makeHandler({ card, canReview: false });

      await handler.execute(carryOn(card.id));

      expect(limitsPolicy.recordRefusal).not.toHaveBeenCalled();
    });

    it('never touches the new-card cap, which is not the learner’s call', async () => {
      const card = makeCard('REVIEW');
      const { handler, limitsPolicy } = makeHandler({ card, canReview: false });

      await handler.execute(carryOn(card.id));

      expect(limitsPolicy.canIntroduceNewCard).not.toHaveBeenCalled();
      expect(limitsPolicy.incrementNewCardCount).not.toHaveBeenCalled();
    });

    it('still refuses when the flag is absent', async () => {
      const card = makeCard('REVIEW');
      const { handler } = makeHandler({ card, canReview: false });

      const result = await handler.execute(cmd(card.id));

      expect(result.isFail).toBe(true);
      expect(result.error).toBeInstanceOf(SrsReviewLimitError);
    });
  });

  describe('limit refusals are recorded (plan 37 §A.1)', () => {
    it('counts the refusal and publishes it when the cap turns a review away', async () => {
      const card = makeCard('REVIEW');
      const { handler, limitsPolicy, publisher } = makeHandler({ card, canReview: false });

      await handler.execute(cmd(card.id));

      expect(limitsPolicy.recordRefusal).toHaveBeenCalledWith(USER_ID, 'review', NOW);
      expect(publisher.publish).toHaveBeenCalledWith('learning.srs.limit_refused', {
        userId: USER_ID,
        kind: 'review',
        contentType: 'EXERCISE',
        occurredAt: NOW.toISOString(),
      });
    });

    it('records nothing when the review goes through', async () => {
      const card = makeCard('REVIEW');
      const { handler, limitsPolicy, publisher } = makeHandler({ card });

      await handler.execute(cmd(card.id));

      expect(limitsPolicy.recordRefusal).not.toHaveBeenCalled();
      expect(publisher.publish).not.toHaveBeenCalledWith(
        'learning.srs.limit_refused',
        expect.anything(),
      );
    });

    it('still refuses when the telemetry write fails', async () => {
      const card = makeCard('REVIEW');
      const { handler, limitsPolicy } = makeHandler({ card, canReview: false });
      (limitsPolicy.recordRefusal as jest.Mock<() => Promise<void>>).mockRejectedValue(
        new Error('redis down'),
      );

      const result = await handler.execute(cmd(card.id));

      expect(result.isFail).toBe(true);
      expect(result.error).toBeInstanceOf(SrsReviewLimitError);
    });
  });

  describe('idempotency', () => {
    it('does not consult the store when no key is sent', async () => {
      const card = makeCard('REVIEW');
      const { handler, idempotency } = makeHandler({ card });

      await handler.execute(cmd(card.id));

      expect(idempotency.claim).not.toHaveBeenCalled();
    });

    it('reschedules once and claims the key on a first submission', async () => {
      const card = makeCard('REVIEW');
      const { handler, repo, idempotency } = makeHandler({ card });

      const result = await handler.execute(
        new ReviewCardCommand(USER_ID, card.id, 'GOOD', undefined, 'key-1'),
      );

      expect(idempotency.claim).toHaveBeenCalledWith(USER_ID, 'key-1');
      expect(result.isOk).toBe(true);
      expect(repo.save).toHaveBeenCalledTimes(1);
    });

    it('returns the card untouched when the key was already used', async () => {
      const card = makeCard('REVIEW');
      const { handler, repo, limitsPolicy, dueQueue, publisher } = makeHandler({
        card,
        claimed: false,
      });

      const result = await handler.execute(
        new ReviewCardCommand(USER_ID, card.id, 'GOOD', undefined, 'key-1'),
      );

      expect(result.isOk).toBe(true);
      expect(result.value.dueAt).toBe(NOW.toISOString()); // not rescheduled to LATER
      expect(repo.save).not.toHaveBeenCalled();
      expect(limitsPolicy.incrementReviewCount).not.toHaveBeenCalled();
      expect(dueQueue.upsert).not.toHaveBeenCalled();
      expect(publisher.publish).not.toHaveBeenCalled();
    });

    it('releases the key when the review is rejected, so a retry can succeed', async () => {
      const card = makeCard('REVIEW');
      const { handler, idempotency } = makeHandler({ card, canReview: false });

      await handler.execute(new ReviewCardCommand(USER_ID, card.id, 'GOOD', undefined, 'key-1'));

      expect(idempotency.release).toHaveBeenCalledWith(USER_ID, 'key-1');
    });
  });
});
