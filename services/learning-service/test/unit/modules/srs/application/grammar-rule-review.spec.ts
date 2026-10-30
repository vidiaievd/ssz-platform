import { jest } from '@jest/globals';
import {
  ReviewCard,
  type ReviewCardState,
} from '../../../../../src/modules/srs/domain/entities/review-card.entity.js';
import type { ISrsRepository } from '../../../../../src/modules/srs/domain/repositories/srs-repository.interface.js';
import type { ISrsScheduler } from '../../../../../src/modules/srs/application/ports/srs-scheduler.port.js';
import type { IContentClient } from '../../../../../src/shared/application/ports/content-client.port.js';
import { ContentClientError } from '../../../../../src/shared/application/ports/content-client.port.js';
import { ContentRef } from '../../../../../src/shared/domain/value-objects/content-ref.js';
import { Result } from '../../../../../src/shared/kernel/result.js';
import { GrammarRuleMasteryService } from '../../../../../src/modules/srs/application/services/grammar-rule-mastery.service.js';
import {
  grammarDueReasons,
  orderReviewPool,
  summarisePool,
} from '../../../../../src/modules/srs/application/services/grammar-rule-review.policy.js';

const NOW = new Date('2026-10-28T10:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const USER_ID = 'c3254eb9-3fb3-4559-9dbf-2cea12f40ed5';
const COURSE_ID = 'aaaaaaaa-bbbb-4000-8000-000000000001';
const MODULE_ID = 'aaaaaaaa-bbbb-4000-8000-000000000002';
const RULE_A = 'bbbbbbbb-0000-4000-8000-00000000000a';
const RULE_B = 'bbbbbbbb-0000-4000-8000-00000000000b';
const RULE_C = 'bbbbbbbb-0000-4000-8000-00000000000c';

function card(
  contentId: string,
  state: ReviewCardState,
  lastReviewedDaysAgo: number | null,
  userId = USER_ID,
): ReviewCard {
  return ReviewCard.reconstitute({
    id: `card-${contentId}`,
    userId,
    contentType: 'EXERCISE',
    contentId,
    track: 'lexis',
    state,
    dueAt: NOW,
    stability: 1,
    difficulty: 5,
    elapsedDays: 0,
    scheduledDays: 0,
    reps: 1,
    lapses: state === 'RELEARNING' ? 1 : 0,
    learningSteps: 0,
    lastReviewedAt: lastReviewedDaysAgo === null ? null : new Date(NOW.getTime() - lastReviewedDaysAgo * DAY),
    createdAt: NOW,
    updatedAt: NOW,
  });
}

describe('grammar rule review policy', () => {
  const half = () => 0.5;

  it('summarises only the cards in the pool, with the latest review', () => {
    const cards = [card('e1', 'REVIEW', 10), card('e2', 'RELEARNING', 3), card('other', 'REVIEW', 0)];
    const summary = summarisePool(['e1', 'e2', 'e3'], cards, half);
    expect(summary).toEqual({
      poolSize: 3,
      introducedCount: 2,
      averageRetrievability: 0.5,
      lastPracticedAt: new Date(NOW.getTime() - 3 * DAY),
      strugglingCount: 1,
    });
  });

  it('is not due when nothing was practised', () => {
    expect(grammarDueReasons(summarisePool(['e1'], [], half), NOW)).toEqual([]);
  });

  it('is stale under 70 % after a week without practice, not before', () => {
    const week = summarisePool(['e1'], [card('e1', 'REVIEW', 7)], () => 0.69);
    const sixDays = summarisePool(['e1'], [card('e1', 'REVIEW', 6)], () => 0.69);
    const strong = summarisePool(['e1'], [card('e1', 'REVIEW', 30)], () => 0.7);
    expect(grammarDueReasons(week, NOW)).toEqual(['stale']);
    expect(grammarDueReasons(sixDays, NOW)).toEqual([]);
    expect(grammarDueReasons(strong, NOW)).toEqual([]);
  });

  it('is due on two lapsed cards whatever the mastery', () => {
    const cards = [card('e1', 'RELEARNING', 0), card('e2', 'RELEARNING', 1)];
    expect(grammarDueReasons(summarisePool(['e1', 'e2'], cards, () => 0.9), NOW)).toEqual(['mistakes']);
    expect(grammarDueReasons(summarisePool(['e1', 'e2'], cards.slice(0, 1), () => 0.9), NOW)).toEqual([]);
  });

  it('orders lapsed first, then never practised, then oldest, and caps the pool', () => {
    const cards = [card('e1', 'REVIEW', 1), card('e2', 'RELEARNING', 0), card('e3', 'REVIEW', 20)];
    expect(orderReviewPool(['e1', 'e2', 'e3', 'e4'], cards)).toEqual(['e2', 'e4', 'e3', 'e1']);
    const many = Array.from({ length: 12 }, (_, i) => `x${i}`);
    expect(orderReviewPool(many, [])).toEqual(many.slice(0, 8));
  });
});

describe('GrammarRuleMasteryService — due rules and review', () => {
  function makeService(pools: Record<string, string[]>, cards: ReviewCard[], retrievability: Record<string, number>) {
    const contentClient = {
      getCourseLeafItems: jest.fn<IContentClient['getCourseLeafItems']>().mockResolvedValue(
        Result.ok([
          { ref: ContentRef.create('LESSON', 'cccccccc-0000-4000-8000-000000000001').value, moduleId: MODULE_ID, isRequired: true },
          ...[RULE_A, RULE_B, RULE_C].map((id) => ({
            ref: ContentRef.create('GRAMMAR_RULE', id).value,
            moduleId: MODULE_ID,
            isRequired: true,
          })),
        ]),
      ),
      getGrammarRulePoolExerciseIds: jest
        .fn<IContentClient['getGrammarRulePoolExerciseIds']>()
        .mockImplementation(async (ruleId) => Result.ok(pools[ruleId] ?? [])),
    } as unknown as IContentClient;
    const findByUserAndContents = jest
      .fn<ISrsRepository['findByUserAndContents']>()
      .mockImplementation(async (userId, contentType, ids) =>
        cards.filter((c) => c.userId === userId && c.contentType === contentType && ids.includes(c.contentId)),
      );
    const repo = { findByUserAndContents } as unknown as ISrsRepository;
    const scheduler = {
      getRetrievability: (c: ReviewCard) => retrievability[c.contentId] ?? 0,
    } as unknown as ISrsScheduler;
    return { service: new GrammarRuleMasteryService(contentClient, repo, scheduler), findByUserAndContents, contentClient };
  }

  it('lists only due rules, lowest mastery first, in one card query', async () => {
    const { service, findByUserAndContents } = makeService(
      { [RULE_A]: ['a1'], [RULE_B]: ['b1'], [RULE_C]: ['c1'] },
      [card('a1', 'REVIEW', 10), card('b1', 'REVIEW', 10), card('c1', 'REVIEW', 1)],
      { a1: 0.6, b1: 0.3, c1: 0.1 },
    );

    const result = await service.getDueForCourse(USER_ID, COURSE_ID, NOW);

    expect(result.value.rules.map((r) => [r.grammarRuleId, r.moduleId, r.dueReasons])).toEqual([
      [RULE_B, MODULE_ID, ['stale']],
      [RULE_A, MODULE_ID, ['stale']],
    ]);
    expect(findByUserAndContents).toHaveBeenCalledTimes(1);
  });

  it('fails when a pool cannot be read', async () => {
    const { service, contentClient } = makeService({}, [], {});
    (contentClient.getGrammarRulePoolExerciseIds as jest.Mock<IContentClient['getGrammarRulePoolExerciseIds']>)
      .mockResolvedValueOnce(Result.fail(new ContentClientError('down')));

    const result = await service.getDueForCourse(USER_ID, COURSE_ID, NOW);

    expect(result.isFail).toBe(true);
  });

  it("gives a rule's review pool and state, ignoring another learner's cards", async () => {
    const { service } = makeService(
      { [RULE_A]: ['a1', 'a2', 'a3'] },
      [card('a1', 'REVIEW', 2), card('a3', 'RELEARNING', 0), card('a2', 'RELEARNING', 0, 'someone-else')],
      { a1: 0.8, a3: 0.4 },
    );

    const result = await service.getReview(USER_ID, RULE_A, NOW);

    expect(result.value).toEqual({
      grammarRuleId: RULE_A,
      poolSize: 3,
      introducedCount: 2,
      averageRetrievability: expect.closeTo(0.6, 5),
      lastPracticedAt: NOW.toISOString(),
      strugglingCount: 1,
      dueReasons: [],
      reviewPool: ['a3', 'a2', 'a1'],
    });
  });
});
