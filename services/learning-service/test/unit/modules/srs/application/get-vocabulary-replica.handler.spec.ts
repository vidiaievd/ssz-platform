import { jest } from '@jest/globals';
import { GetVocabularyReplicaHandler } from '../../../../../src/modules/srs/application/queries/get-vocabulary-replica.handler.js';
import { GetVocabularyReplicaQuery } from '../../../../../src/modules/srs/application/queries/get-vocabulary-replica.query.js';
import { ReviewCard } from '../../../../../src/modules/srs/domain/entities/review-card.entity.js';
import type { ISrsRepository } from '../../../../../src/modules/srs/domain/repositories/srs-repository.interface.js';
import type { ISrsLimitsPolicy } from '../../../../../src/modules/srs/application/ports/srs-limits-policy.port.js';
import type { IClock } from '../../../../../src/shared/application/ports/clock.port.js';

const NOW = new Date('2026-10-15T08:00:00Z');
const USER_ID = 'c3254eb9-3fb3-4559-9dbf-2cea12f40ed5';
const WORD_A = 'eb1aa566-c4e0-4ffa-8018-e9ce2abc5d08';
const WORD_B = '9f1c2f0e-6a2b-4d0e-8f3a-2d5f4a1b7c33';

function makeHandler(cards: ReviewCard[]) {
  const findByUserAndType = jest.fn<ISrsRepository['findByUserAndType']>().mockResolvedValue(cards);
  const getReviewedCount = jest.fn<ISrsLimitsPolicy['getReviewedCount']>().mockResolvedValue(12);
  const getDailyReviewLimit = jest
    .fn<ISrsLimitsPolicy['getDailyReviewLimit']>()
    .mockReturnValue(200);

  const repo = { findByUserAndType } as unknown as ISrsRepository;
  const limits = { getReviewedCount, getDailyReviewLimit } as unknown as ISrsLimitsPolicy;
  const clock: IClock = { now: () => NOW };

  return {
    handler: new GetVocabularyReplicaHandler(repo, limits, clock),
    findByUserAndType,
    getReviewedCount,
    getDailyReviewLimit,
  };
}

describe('GetVocabularyReplicaHandler', () => {
  it('returns every vocabulary card with its full state and no predictions', async () => {
    const fresh = ReviewCard.create(USER_ID, 'VOCABULARY_WORD', WORD_A, 'lexis', NOW);
    const known = ReviewCard.createSeeded(
      USER_ID,
      'VOCABULARY_WORD',
      WORD_B,
      'lexis',
      'DIAGNOSTIC_KNOWN',
      NOW,
    );
    const { handler, findByUserAndType } = makeHandler([fresh, known]);

    const result = await handler.execute(new GetVocabularyReplicaQuery(USER_ID));

    expect(findByUserAndType).toHaveBeenCalledWith(USER_ID, 'VOCABULARY_WORD');
    expect(result.cards.map((c) => c.contentId)).toEqual([WORD_A, WORD_B]);
    expect(result.cards[1]).toMatchObject({
      state: 'REVIEW',
      stability: 60,
      reps: expect.any(Number),
      lapses: expect.any(Number),
      predicted: [],
    });
    expect(result.cards[1]).not.toHaveProperty('front');
  });

  it('carries the server time and the vocabulary budget of the day', async () => {
    const { handler, getReviewedCount, getDailyReviewLimit } = makeHandler([]);

    const result = await handler.execute(new GetVocabularyReplicaQuery(USER_ID));

    expect(result).toEqual({
      serverTime: NOW.toISOString(),
      reviewedToday: 12,
      dailyLimit: 200,
      cards: [],
    });
    // The words' own budget, not the day as a whole: rules have theirs.
    expect(getReviewedCount).toHaveBeenCalledWith(USER_ID, NOW, 'lexis');
    expect(getDailyReviewLimit).toHaveBeenCalledWith('lexis');
  });
});
