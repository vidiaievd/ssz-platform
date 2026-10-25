import { jest } from '@jest/globals';
import {
  ListReviewTermsAheadHandler,
  MAX_TERM_ROWS,
} from '../../../src/modules/attempts/application/queries/list-review-terms-ahead/list-review-terms-ahead.handler.js';
import { ListReviewTermsAheadQuery } from '../../../src/modules/attempts/application/queries/list-review-terms-ahead/list-review-terms-ahead.query.js';
import type { ReviewTermRow } from '../../../src/modules/attempts/domain/repositories/attempt.repository.js';

const row: ReviewTermRow = {
  attemptId: 'attempt-1',
  containerId: 'course-1',
  groupId: 'group-1',
  submittedAt: new Date('2026-10-18T09:00:00Z'),
  autoAcceptAt: new Date('2026-10-25T09:00:00Z'),
};

describe('ListReviewTermsAheadHandler', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-10-24T12:00:00Z') });
  });
  afterEach(() => jest.useRealTimers());

  it('asks for the terms between now and the horizon, in the school', async () => {
    const findReviewTermsAhead = jest.fn((..._args: unknown[]) => Promise.resolve([row]));
    const handler = new ListReviewTermsAheadHandler({ findReviewTermsAhead } as never);

    const result = await handler.execute(new ListReviewTermsAheadQuery('school-1', 24));

    expect(result).toEqual({ terms: [row] });
    expect(findReviewTermsAhead).toHaveBeenCalledWith(
      'school-1',
      new Date('2026-10-24T12:00:00Z'),
      new Date('2026-10-25T12:00:00Z'),
      MAX_TERM_ROWS,
    );
  });
});
