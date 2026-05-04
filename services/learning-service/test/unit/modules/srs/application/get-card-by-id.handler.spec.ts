import { jest } from '@jest/globals';
import { GetCardByIdHandler } from '../../../../../src/modules/srs/application/queries/get-card-by-id.handler.js';
import { GetCardByIdQuery } from '../../../../../src/modules/srs/application/queries/get-card-by-id.query.js';
import {
  SrsCardNotFoundError,
  SrsCardUnauthorizedError,
} from '../../../../../src/modules/srs/application/errors/srs-application.errors.js';
import { ReviewCard } from '../../../../../src/modules/srs/domain/entities/review-card.entity.js';
import type { ISrsRepository } from '../../../../../src/modules/srs/domain/repositories/srs-repository.interface.js';

const NOW        = new Date('2026-04-29T10:00:00Z');
const USER_ID    = 'c3254eb9-3fb3-4559-9dbf-2cea12f40ed5';
const OTHER_ID   = 'aaaaaaaa-bbbb-4000-8000-000000000001';
const CONTENT_ID = 'eb1aa566-c4e0-4ffa-8018-e9ce2abc5d08';

function makeHandler(card: ReviewCard | null) {
  const repo: ISrsRepository = {
    findById: jest.fn<() => Promise<ReviewCard | null>>().mockResolvedValue(card),
    findByUserAndContent: jest.fn(),
    findDueCards: jest.fn(),
    save: jest.fn(),
    countNewToday: jest.fn(),
    countReviewedToday: jest.fn(),
    getStatsByUser: jest.fn(),
  } as any;
  return { handler: new GetCardByIdHandler(repo), repo };
}

describe('GetCardByIdHandler', () => {
  it('returns card DTO when card exists and belongs to requesting user', async () => {
    const card = ReviewCard.create(USER_ID, 'EXERCISE', CONTENT_ID, NOW);
    const { handler } = makeHandler(card);

    const result = await handler.execute(new GetCardByIdQuery(USER_ID, card.id));

    expect(result.isOk).toBe(true);
    expect(result.value.id).toBe(card.id);
    expect(result.value.userId).toBe(USER_ID);
    expect(result.value.state).toBe('NEW');
  });

  it('returns SrsCardNotFoundError when card does not exist', async () => {
    const { handler } = makeHandler(null);

    const result = await handler.execute(new GetCardByIdQuery(USER_ID, 'missing-id'));

    expect(result.isFail).toBe(true);
    expect(result.error).toBeInstanceOf(SrsCardNotFoundError);
  });

  it('returns SrsCardUnauthorizedError when card belongs to a different user', async () => {
    const card = ReviewCard.create(OTHER_ID, 'EXERCISE', CONTENT_ID, NOW);
    const { handler } = makeHandler(card);

    const result = await handler.execute(new GetCardByIdQuery(USER_ID, card.id));

    expect(result.isFail).toBe(true);
    expect(result.error).toBeInstanceOf(SrsCardUnauthorizedError);
  });
});
