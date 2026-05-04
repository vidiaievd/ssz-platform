import { jest } from '@jest/globals';
import { IntroduceCardHandler } from '../../../../../src/modules/srs/application/commands/introduce-card.handler.js';
import { IntroduceCardCommand } from '../../../../../src/modules/srs/application/commands/introduce-card.command.js';
import { SrsNewCardLimitError } from '../../../../../src/modules/srs/application/errors/srs-application.errors.js';
import { ReviewCard } from '../../../../../src/modules/srs/domain/entities/review-card.entity.js';
import type { ISrsRepository } from '../../../../../src/modules/srs/domain/repositories/srs-repository.interface.js';
import type { ISrsLimitsPolicy } from '../../../../../src/modules/srs/application/ports/srs-limits-policy.port.js';
import type { IEventPublisher } from '../../../../../src/shared/application/ports/event-publisher.port.js';
import type { IClock } from '../../../../../src/shared/application/ports/clock.port.js';

const NOW        = new Date('2026-04-29T10:00:00Z');
const USER_ID    = 'c3254eb9-3fb3-4559-9dbf-2cea12f40ed5';
const CONTENT_ID = 'eb1aa566-c4e0-4ffa-8018-e9ce2abc5d08';

const cmd = new IntroduceCardCommand(USER_ID, 'EXERCISE', CONTENT_ID);

function makeHandler(overrides: {
  existingCard?: ReviewCard | null;
  canIntroduce?: boolean;
} = {}) {
  const repo: ISrsRepository = {
    findById: jest.fn(),
    findByUserAndContent: jest.fn<() => Promise<ReviewCard | null>>().mockResolvedValue(
      overrides.existingCard ?? null,
    ),
    findDueCards: jest.fn(),
    save: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    countNewToday: jest.fn(),
    countReviewedToday: jest.fn(),
    getStatsByUser: jest.fn(),
  } as any;

  const limitsPolicy: ISrsLimitsPolicy = {
    canIntroduceNewCard: jest.fn<() => Promise<boolean>>().mockResolvedValue(
      overrides.canIntroduce ?? true,
    ),
    canReview: jest.fn(),
    incrementNewCardCount: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    incrementReviewCount: jest.fn(),
  } as any;

  const publisher: IEventPublisher = {
    publish: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };

  const clock: IClock = { now: () => NOW };

  return {
    handler: new IntroduceCardHandler(repo, limitsPolicy, publisher, clock),
    repo,
    limitsPolicy,
    publisher,
  };
}

describe('IntroduceCardHandler', () => {
  it('creates a new card and returns its DTO', async () => {
    const { handler, repo, limitsPolicy } = makeHandler();

    const result = await handler.execute(cmd);

    expect(result.isOk).toBe(true);
    expect(result.value.userId).toBe(USER_ID);
    expect(result.value.contentType).toBe('EXERCISE');
    expect(result.value.state).toBe('NEW');
    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(limitsPolicy.incrementNewCardCount).toHaveBeenCalledTimes(1);
  });

  it('publishes ReviewCardCreatedEvent', async () => {
    const { handler, publisher } = makeHandler();

    await handler.execute(cmd);

    expect(publisher.publish).toHaveBeenCalledWith(
      'learning.srs.card.created',
      expect.any(Object),
    );
  });

  it('returns existing card without saving or incrementing limit (idempotent)', async () => {
    const existing = ReviewCard.create(USER_ID, 'EXERCISE', CONTENT_ID, NOW);
    const { handler, repo, limitsPolicy } = makeHandler({ existingCard: existing });

    const result = await handler.execute(cmd);

    expect(result.isOk).toBe(true);
    expect(result.value.id).toBe(existing.id);
    expect(repo.save).not.toHaveBeenCalled();
    expect(limitsPolicy.incrementNewCardCount).not.toHaveBeenCalled();
    expect(limitsPolicy.canIntroduceNewCard).not.toHaveBeenCalled();
  });

  it('fails with SrsNewCardLimitError when daily limit is reached', async () => {
    const { handler } = makeHandler({ canIntroduce: false });

    const result = await handler.execute(cmd);

    expect(result.isFail).toBe(true);
    expect(result.error).toBeInstanceOf(SrsNewCardLimitError);
  });
});
