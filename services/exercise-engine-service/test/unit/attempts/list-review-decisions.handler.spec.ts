import { jest } from '@jest/globals';
import { ListReviewDecisionsHandler } from '../../../src/modules/attempts/application/queries/list-review-decisions/list-review-decisions.handler.js';
import { ListReviewDecisionsQuery } from '../../../src/modules/attempts/application/queries/list-review-decisions/list-review-decisions.query.js';
import {
  decodeReviewDecisionsCursor,
  encodeReviewDecisionsCursor,
} from '../../../src/modules/attempts/application/queries/list-review-decisions/review-decisions-cursor.js';
import {
  Attempt,
  type AttemptPersistenceProps,
} from '../../../src/modules/attempts/domain/entities/attempt.entity.js';

const SCHOOL = 'school-1';

function decided(props: Partial<AttemptPersistenceProps> = {}): Attempt {
  return Attempt.reconstitute({
    id: 'att-1',
    userId: 'student-1',
    exerciseId: 'ex-1',
    assignmentId: null,
    enrollmentId: null,
    templateCode: 'translate_to_target',
    targetLanguage: 'no',
    difficultyLevel: 'A2',
    checkMode: 'GRADED',
    practicedAtoms: [],
    status: 'SCORED',
    score: 100,
    passed: true,
    timeSpentSeconds: 300,
    submittedAnswer: {},
    validationDetails: null,
    feedback: null,
    answerHash: 'hash',
    revisionCount: 0,
    recheckCount: 0,
    answersRevealed: false,
    selfChecksUsed: 0,
    startedAt: new Date('2026-08-17T08:00:00Z'),
    submittedAt: new Date('2026-08-17T09:00:00Z'),
    scoredAt: new Date('2026-08-17T13:00:00Z'),
    reviewedByUserId: 'teacher-1',
    reviewedAt: new Date('2026-08-17T13:00:00Z'),
    reviewComment: null,
    reviewDecisions: null,
    schoolId: SCHOOL,
    containerId: 'course-1',
    groupId: 'group-1',
    exercisePath: { course: 'Ny i Norge — A2', module: 'Leksjon 19', exercise: 'Familien' },
    reviewClaimedBy: null,
    reviewClaimedAt: null,
    previousAttemptId: null,
    autoPassedItems: null,
    totalItems: null,
    ...props,
  });
}

function makeHandler(rows: Attempt[]) {
  const attempts = { findReviewDecisionsPage: jest.fn(() => Promise.resolve(rows)) };
  return { handler: new ListReviewDecisionsHandler(attempts as never), attempts };
}

const query = (limit = 50) => new ListReviewDecisionsQuery(SCHOOL, 30, limit, null);

describe('ListReviewDecisionsHandler', () => {
  it('reports the verdict, both times and the path the exercise had', async () => {
    const { handler } = makeHandler([decided()]);

    const result = await handler.execute(query());

    expect(result.items).toEqual([
      {
        attemptId: 'att-1',
        userId: 'student-1',
        exerciseId: 'ex-1',
        exercisePath: {
          course: 'Ny i Norge — A2',
          module: 'Leksjon 19',
          exercise: 'Familien',
        },
        reviewerId: 'teacher-1',
        verdict: 'approved',
        submittedAt: new Date('2026-08-17T09:00:00Z'),
        reviewedAt: new Date('2026-08-17T13:00:00Z'),
      },
    ]);
    expect(result.nextCursor).toBeNull();
  });

  it('names a return as a return', async () => {
    const { handler } = makeHandler([
      decided({ status: 'RETURNED', score: null, passed: null, reviewComment: 'Se på perfektum.' }),
    ]);

    expect((await handler.execute(query())).items[0]!.verdict).toBe('returned');
  });

  /**
   * A journal listing machine scores would tell an administrator their teachers reviewed
   * work nobody read (the same reading 44.7 and 44.9 use).
   */
  it('leaves a machine score out of a journal of decisions', async () => {
    const { handler } = makeHandler([decided({ reviewedByUserId: null, reviewedAt: null })]);

    expect((await handler.execute(query())).items).toEqual([]);
  });

  it('pages from the row the page ended on, not from the last row it kept', async () => {
    const machine = decided({ id: 'att-9', reviewedByUserId: null, reviewedAt: null });
    const { handler, attempts } = makeHandler([decided(), machine]);

    const result = await handler.execute(query(1));

    // Asked for one, given two: the second exists, so there is a next page.
    expect(attempts.findReviewDecisionsPage.mock.calls[0]![2]).toMatchObject({ limit: 2 });
    expect(result.items).toHaveLength(1);
    expect(decodeReviewDecisionsCursor(result.nextCursor!)).toEqual({
      reviewedAt: new Date('2026-08-17T13:00:00Z'),
      id: 'att-1',
    });
  });

  it('asks the repository for the page after the cursor it was given', async () => {
    const after = { reviewedAt: new Date('2026-08-16T10:00:00Z'), id: 'att-0' };
    const { handler, attempts } = makeHandler([]);

    await handler.execute(
      new ListReviewDecisionsQuery(SCHOOL, 30, 50, decodeReviewDecisionsCursor(
        encodeReviewDecisionsCursor(after),
      )),
    );

    expect(attempts.findReviewDecisionsPage.mock.calls[0]![2]).toMatchObject({ after });
  });
});

describe('the journal cursor', () => {
  it('survives a round trip', () => {
    const cursor = { reviewedAt: new Date('2026-08-17T13:00:00Z'), id: 'att-1' };

    expect(decodeReviewDecisionsCursor(encodeReviewDecisionsCursor(cursor))).toEqual(cursor);
  });

  /** Refused, not quietly answered with page one — a reader on page four cannot tell. */
  it('refuses anything this service did not issue', () => {
    expect(decodeReviewDecisionsCursor('not-a-cursor')).toBeNull();
    expect(decodeReviewDecisionsCursor(Buffer.from('|att-1').toString('base64url'))).toBeNull();
    expect(
      decodeReviewDecisionsCursor(Buffer.from('not-a-date|att-1').toString('base64url')),
    ).toBeNull();
  });
});
