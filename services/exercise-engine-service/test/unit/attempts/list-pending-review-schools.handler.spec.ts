import { jest } from '@jest/globals';
import { ListPendingReviewSchoolsHandler } from '../../../src/modules/attempts/application/queries/list-pending-review-schools/list-pending-review-schools.handler.js';
import type { PendingSchoolRow } from '../../../src/modules/attempts/domain/repositories/attempt.repository.js';

function makeHandler(rows: PendingSchoolRow[]) {
  const attempts = { findSchoolsWithPendingReview: jest.fn(() => Promise.resolve(rows)) };
  return { handler: new ListPendingReviewSchoolsHandler(attempts as never), attempts };
}

const row = (overrides: Partial<PendingSchoolRow> = {}): PendingSchoolRow => ({
  schoolId: 'school-1',
  pending: 3,
  oldestSubmittedAt: new Date('2026-08-18T09:00:00Z'),
  newestSubmittedAt: new Date('2026-08-19T09:00:00Z'),
  ...overrides,
});

describe('ListPendingReviewSchoolsHandler', () => {
  it('reports what each school has waiting and since when', async () => {
    const { handler } = makeHandler([row()]);

    const result = await handler.execute();

    expect(result.schools).toEqual([
      {
        schoolId: 'school-1',
        pending: 3,
        oldestSubmittedAt: new Date('2026-08-18T09:00:00Z'),
        newestSubmittedAt: new Date('2026-08-19T09:00:00Z'),
      },
    ]);
  });

  /** A job that runs out of time should have spent it where the most people are waiting. */
  it('puts the fullest queues first', async () => {
    const { handler } = makeHandler([
      row({ schoolId: 'quiet', pending: 1 }),
      row({ schoolId: 'busy', pending: 40 }),
    ]);

    const result = await handler.execute();

    expect(result.schools.map((school) => school.schoolId)).toEqual(['busy', 'quiet']);
  });

  /**
   * The answer a quiet platform must be able to give: nothing is waiting, so nobody hears
   * from the digest. An empty list is what makes "send nothing" the default rather than a
   * special case the caller has to remember.
   */
  it('says nothing is waiting rather than inventing a school', async () => {
    const { handler } = makeHandler([]);

    await expect(handler.execute()).resolves.toEqual({ schools: [] });
  });
});
