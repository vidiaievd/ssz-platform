import { jest } from '@jest/globals';
import { IntroduceCardHandler } from '../../../../../src/modules/srs/application/commands/introduce-card.handler.js';
import { IntroduceCardCommand } from '../../../../../src/modules/srs/application/commands/introduce-card.command.js';
import { ReviewCard } from '../../../../../src/modules/srs/domain/entities/review-card.entity.js';
import type { ISrsRepository } from '../../../../../src/modules/srs/domain/repositories/srs-repository.interface.js';
import type { ISrsLimitsPolicy } from '../../../../../src/modules/srs/application/ports/srs-limits-policy.port.js';
import type { IEventPublisher } from '../../../../../src/shared/application/ports/event-publisher.port.js';
import type { IClock } from '../../../../../src/shared/application/ports/clock.port.js';

const NOW        = new Date('2026-04-29T10:00:00Z');
const TODAY_START = new Date('2026-04-29T00:00:00Z');
const TOMORROW   = new Date('2026-04-30T00:00:00Z');
const USER_ID    = 'c3254eb9-3fb3-4559-9dbf-2cea12f40ed5';
const CONTENT_ID = 'eb1aa566-c4e0-4ffa-8018-e9ce2abc5d08';

const cmd = new IntroduceCardCommand(USER_ID, 'EXERCISE', CONTENT_ID);

function makeHandler(overrides: {
  existingCard?: ReviewCard | null;
  /** The day the budget hands the card; today's start when omitted (room today). */
  claimedDay?: Date;
  /** What the atom says its track is — only grammar atoms ever ask (plan 63 phase 6). */
  track?: 'lexis' | 'grammar';
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
    claimNewCardDay: jest.fn<() => Promise<Date>>().mockResolvedValue(
      overrides.claimedDay ?? TODAY_START,
    ),
    canReview: jest.fn(),
    incrementReviewCount: jest.fn(),
    recordRefusal: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  } as any;

  const publisher: IEventPublisher = {
    publish: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };

  const clock: IClock = { now: () => NOW };

  const trackResolver = {
    resolve: jest
      .fn<() => Promise<'lexis' | 'grammar'>>()
      .mockResolvedValue(overrides.track ?? 'lexis'),
  } as any;

  return {
    handler: new IntroduceCardHandler(repo, limitsPolicy, publisher, clock, trackResolver),
    repo,
    limitsPolicy,
    publisher,
    trackResolver,
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
    expect(limitsPolicy.claimNewCardDay).toHaveBeenCalledWith(USER_ID, 'lexis', NOW);
    // Room today: due on introduction, as it always was.
    expect(result.value.dueAt).toEqual(NOW.toISOString());
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
    const existing = ReviewCard.create(USER_ID, 'EXERCISE', CONTENT_ID, 'lexis', NOW);
    const { handler, repo, limitsPolicy } = makeHandler({ existingCard: existing });

    const result = await handler.execute(cmd);

    expect(result.isOk).toBe(true);
    expect(result.value.id).toBe(existing.id);
    expect(repo.save).not.toHaveBeenCalled();
    expect(limitsPolicy.claimNewCardDay).not.toHaveBeenCalled();
  });

  // Plan 37 §C.1 — the work is done by the time a card is introduced, so the budget
  // may decide when the card comes back, never whether it exists.
  describe('a spent budget holds the card back instead of refusing it', () => {
    it('creates the card due on the day the budget gives it', async () => {
      const { handler, repo } = makeHandler({ claimedDay: TOMORROW });

      const result = await handler.execute(cmd);

      expect(result.isOk).toBe(true);
      expect(repo.save).toHaveBeenCalledTimes(1);
      expect(result.value.state).toBe('NEW');
      expect(result.value.dueAt).toEqual(TOMORROW.toISOString());
    });

    it('creates every card of a six-gap block on a spent budget', async () => {
      const { handler, repo } = makeHandler({ claimedDay: TOMORROW });

      for (let gap = 0; gap < 6; gap++) {
        const result = await handler.execute(
          new IntroduceCardCommand(USER_ID, 'EXERCISE_GAP', `${CONTENT_ID}#${gap}`),
        );
        expect(result.isOk).toBe(true);
      }

      expect(repo.save).toHaveBeenCalledTimes(6);
    });

    it('records no refusal, since nothing was refused', async () => {
      const { handler, limitsPolicy, publisher } = makeHandler({ claimedDay: TOMORROW });

      await handler.execute(cmd);

      expect(limitsPolicy.recordRefusal).not.toHaveBeenCalled();
      expect(publisher.publish).not.toHaveBeenCalledWith(
        'learning.srs.limit_refused',
        expect.anything(),
      );
    });

    it('charges the track the card belongs to', async () => {
      const { handler, limitsPolicy } = makeHandler({ track: 'grammar' });

      await handler.execute(cmd);

      expect(limitsPolicy.claimNewCardDay).toHaveBeenCalledWith(USER_ID, 'grammar', NOW);
    });

    it('does not charge a seeded card', async () => {
      const { handler, limitsPolicy } = makeHandler({ claimedDay: TOMORROW });

      const result = await handler.execute(
        new IntroduceCardCommand(USER_ID, 'VOCABULARY_WORD', CONTENT_ID, 'CLAIMED_KNOWN'),
      );

      expect(result.isOk).toBe(true);
      expect(limitsPolicy.claimNewCardDay).not.toHaveBeenCalled();
    });
  });
});

// Plan 63 phase 5 — the shadow half of the fan-out opens cards nobody is shown.
describe('IntroduceCardHandler — shadow cards', () => {
  const shadowCmd = new IntroduceCardCommand(USER_ID, 'GRAMMAR_ATOM', CONTENT_ID, undefined, true);

  it('creates the card without charging the daily new-card budget', async () => {
    const { handler, repo, limitsPolicy } = makeHandler();

    const result = await handler.execute(shadowCmd);

    expect(result.isOk).toBe(true);
    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(limitsPolicy.claimNewCardDay).not.toHaveBeenCalled();
  });

  it('is not held back when the learner has spent the day s budget', async () => {
    // The budget caps how much new material a person is asked to carry, and nobody is
    // being asked to carry this one. Holding it back would stop the shadow model
    // collecting on exactly the days the learner works hardest.
    const { handler } = makeHandler({ claimedDay: TOMORROW });

    const result = await handler.execute(shadowCmd);

    expect(result.isOk).toBe(true);
    expect(result.value.dueAt).toEqual(NOW.toISOString());
  });
});
