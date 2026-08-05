import { jest } from '@jest/globals';
import { GetCardStatesHandler } from '../../../../../src/modules/srs/application/queries/get-card-states.handler.js';
import { GetCardStatesQuery } from '../../../../../src/modules/srs/application/queries/get-card-states.query.js';
import { ReviewCard } from '../../../../../src/modules/srs/domain/entities/review-card.entity.js';
import type { ISrsRepository } from '../../../../../src/modules/srs/domain/repositories/srs-repository.interface.js';

const NOW = new Date('2026-04-29T10:00:00Z');
const USER_ID = 'c3254eb9-3fb3-4559-9dbf-2cea12f40ed5';
const OTHER_ID = 'aaaaaaaa-bbbb-4000-8000-000000000001';
const WORD_A = 'eb1aa566-c4e0-4ffa-8018-e9ce2abc5d08';
const WORD_B = '9f1c2f0e-6a2b-4d0e-8f3a-2d5f4a1b7c33';
const WORD_C = '2b5f8d21-0c44-4a7e-9b31-6d8e0f1a2c44';

function makeHandler(cardsInStore: ReviewCard[]) {
  // Mirrors the Prisma repository contract: scoped by userId and contentType,
  // returns only the cards whose contentId was asked for.
  const findByUserAndContents = jest
    .fn<ISrsRepository['findByUserAndContents']>()
    .mockImplementation(async (userId, contentType, contentIds) =>
      cardsInStore.filter(
        (c) =>
          c.userId === userId &&
          c.contentType === contentType &&
          contentIds.includes(c.contentId),
      ),
    );

  const repo = { findByUserAndContents } as unknown as ISrsRepository;
  return { handler: new GetCardStatesHandler(repo), findByUserAndContents };
}

describe('GetCardStatesHandler', () => {
  it('returns an empty list and does not query when no content ids are requested', async () => {
    const { handler, findByUserAndContents } = makeHandler([]);

    const result = await handler.execute(
      new GetCardStatesQuery(USER_ID, 'VOCABULARY_WORD', []),
    );

    expect(result).toEqual({ states: [] });
    expect(findByUserAndContents).not.toHaveBeenCalled();
  });

  it('projects state, stability and dueAt for the cards that exist', async () => {
    const seeded = ReviewCard.createSeeded(
      USER_ID,
      'VOCABULARY_WORD',
      WORD_A,
      'DIAGNOSTIC_KNOWN',
      NOW,
    );
    const { handler } = makeHandler([seeded]);

    const result = await handler.execute(
      new GetCardStatesQuery(USER_ID, 'VOCABULARY_WORD', [WORD_A]),
    );

    expect(result.states).toEqual([
      {
        contentId: WORD_A,
        state: 'REVIEW',
        stability: 60,
        dueAt: new Date(NOW.getTime() + 60 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ]);
  });

  it('omits content ids the user has no card for', async () => {
    const cardA = ReviewCard.create(USER_ID, 'VOCABULARY_WORD', WORD_A, NOW);
    const { handler } = makeHandler([cardA]);

    const result = await handler.execute(
      new GetCardStatesQuery(USER_ID, 'VOCABULARY_WORD', [WORD_A, WORD_B, WORD_C]),
    );

    expect(result.states.map((s) => s.contentId)).toEqual([WORD_A]);
  });

  it('does not leak cards belonging to another user', async () => {
    const mine = ReviewCard.create(USER_ID, 'VOCABULARY_WORD', WORD_A, NOW);
    const theirs = ReviewCard.create(OTHER_ID, 'VOCABULARY_WORD', WORD_B, NOW);
    const { handler, findByUserAndContents } = makeHandler([mine, theirs]);

    const result = await handler.execute(
      new GetCardStatesQuery(USER_ID, 'VOCABULARY_WORD', [WORD_A, WORD_B]),
    );

    expect(findByUserAndContents).toHaveBeenCalledWith(USER_ID, 'VOCABULARY_WORD', [
      WORD_A,
      WORD_B,
    ]);
    expect(result.states.map((s) => s.contentId)).toEqual([WORD_A]);
  });

  it('does not return cards of a different content type', async () => {
    const exerciseCard = ReviewCard.create(USER_ID, 'EXERCISE', WORD_A, NOW);
    const { handler } = makeHandler([exerciseCard]);

    const result = await handler.execute(
      new GetCardStatesQuery(USER_ID, 'VOCABULARY_WORD', [WORD_A]),
    );

    expect(result.states).toEqual([]);
  });

  it('collapses duplicate content ids before querying', async () => {
    const cardA = ReviewCard.create(USER_ID, 'VOCABULARY_WORD', WORD_A, NOW);
    const { handler, findByUserAndContents } = makeHandler([cardA]);

    const result = await handler.execute(
      new GetCardStatesQuery(USER_ID, 'VOCABULARY_WORD', [WORD_A, WORD_A, WORD_B]),
    );

    expect(findByUserAndContents).toHaveBeenCalledWith(USER_ID, 'VOCABULARY_WORD', [
      WORD_A,
      WORD_B,
    ]);
    expect(result.states).toHaveLength(1);
  });
});
