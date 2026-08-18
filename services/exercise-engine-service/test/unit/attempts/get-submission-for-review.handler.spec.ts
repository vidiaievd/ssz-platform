import { jest } from '@jest/globals';
import { GetSubmissionForReviewHandler } from '../../../src/modules/attempts/application/queries/get-submission-for-review/get-submission-for-review.handler.js';
import { GetSubmissionForReviewQuery } from '../../../src/modules/attempts/application/queries/get-submission-for-review/get-submission-for-review.query.js';
import {
  Attempt,
  REVIEW_CLAIM_TTL_MS,
  type AttemptPersistenceProps,
  type AttemptStatus,
} from '../../../src/modules/attempts/domain/entities/attempt.entity.js';
import { ContentClientError } from '../../../src/shared/application/ports/content-client.port.js';
import { Result } from '../../../src/shared/kernel/result.js';

const SCHOOL = 'school-1';

function attempt(props: Partial<AttemptPersistenceProps> & { id: string }): Attempt {
  return Attempt.reconstitute({
    userId: 'student-1',
    exerciseId: 'ex-1',
    assignmentId: null,
    enrollmentId: null,
    templateCode: 'translate_to_target',
    targetLanguage: 'no',
    difficultyLevel: 'B1',
    checkMode: 'GRADED',
    practicedAtoms: [],
    status: 'ROUTED_FOR_REVIEW' as AttemptStatus,
    score: null,
    passed: null,
    timeSpentSeconds: 60,
    submittedAnswer: [{ itemId: 'i1', text: 'Jeg har bodd i Tromsø.' }],
    validationDetails: null,
    feedback: null,
    answerHash: 'hash',
    revisionCount: 0,
    recheckCount: 0,
    answersRevealed: false,
    selfChecksUsed: 0,
    startedAt: new Date('2026-08-15T10:00:00Z'),
    submittedAt: new Date('2026-08-15T10:20:00Z'),
    scoredAt: null,
    reviewedByUserId: null,
    reviewedAt: null,
    reviewComment: null,
    reviewDecisions: null,
    schoolId: SCHOOL,
    containerId: 'course-1',
    groupId: 'group-1',
    exercisePath: { course: 'Ny i Norge A2', module: 'Leksjon 7', exercise: 'Perfektum' },
    reviewClaimedBy: null,
    reviewClaimedAt: null,
    previousAttemptId: null,
    autoPassedItems: null,
    totalItems: null,
    ...props,
  });
}

const DEFINITION = {
  exercise: {
    id: 'ex-1',
    templateCode: 'translate_to_target',
    targetLanguage: 'no',
    difficultyLevel: 'B1',
    content: { items: [{ id: 'i1', source: 'I have lived in Tromsø.' }] },
    expectedAnswers: { items: [{ id: 'i1', accepted: ['Jeg har bodd i Tromsø.'] }] },
    answerCheckSettings: null,
  },
  template: {
    code: 'translate_to_target',
    contentSchema: {},
    answerSchema: {},
    defaultCheckSettings: {},
    supportedLanguages: null,
  },
  instruction: null,
};

const DETAILS = { items: [{ itemId: 'i1', routing: 'review' }] };

function makeHandler(
  rows: Attempt[],
  overrides?: {
    exercise?: Result<unknown, ContentClientError>;
    validation?: Result<{ details: unknown }, Error>;
  },
) {
  const attempts = {
    findById: jest.fn((id: string) => Promise.resolve(rows.find((row) => row.id === id) ?? null)),
  };
  const contentClient = {
    getExerciseForAttempt: jest.fn(() =>
      Promise.resolve(overrides?.exercise ?? Result.ok(DEFINITION)),
    ),
  };
  const validator = {
    validate: jest.fn(() =>
      Promise.resolve(overrides?.validation ?? Result.ok({ details: DETAILS })),
    ),
  };

  const handler = new GetSubmissionForReviewHandler(
    attempts as never,
    validator as never,
    contentClient as never,
  );
  return { handler, attempts, contentClient, validator };
}

const run = (handler: GetSubmissionForReviewHandler, id: string, school = SCHOOL) =>
  handler.execute(new GetSubmissionForReviewQuery(id, school));

describe('GetSubmissionForReviewHandler', () => {
  it('returns the submission with the parse recomputed now', async () => {
    const { handler, validator } = makeHandler([attempt({ id: 'a1' })]);

    const result = await run(handler, 'a1');

    expect(result.isFail).toBe(false);
    expect(result.value).toMatchObject({
      attemptId: 'a1',
      userId: 'student-1',
      status: 'ROUTED_FOR_REVIEW',
      exerciseId: 'ex-1',
      templateCode: 'translate_to_target',
      targetLanguage: 'no',
      exerciseAvailable: true,
      attemptNo: 1,
      previous: null,
      decision: null,
      lock: null,
      details: DETAILS,
      text: null,
    });
    expect(result.value.path).toEqual({
      course: 'Ny i Norge A2',
      module: 'Leksjon 7',
      exercise: 'Perfektum',
    });
    // Never read back from the attempt: the author's key may have changed since.
    expect(validator.validate).toHaveBeenCalledTimes(1);
  });

  it('is not found when the caller names another school', async () => {
    const { handler, contentClient } = makeHandler([attempt({ id: 'a1' })]);

    const result = await run(handler, 'a1', 'school-2');

    expect(result.isFail).toBe(true);
    expect(result.error).toEqual({ code: 'ATTEMPT_NOT_FOUND' });
    expect(contentClient.getExerciseForAttempt).not.toHaveBeenCalled();
  });

  it('is not found when the attempt does not exist', async () => {
    const { handler } = makeHandler([]);

    const result = await run(handler, 'nope');

    expect(result.isFail).toBe(true);
  });

  it('answers with details: null rather than failing when the parse cannot be built', async () => {
    const { handler } = makeHandler([attempt({ id: 'a1' })], {
      validation: Result.fail(new Error('unreadable')),
    });

    const result = await run(handler, 'a1');

    expect(result.isFail).toBe(false);
    expect(result.value.details).toBeNull();
    // The answer is still there: the teacher can read and decide without the diff.
    expect(result.value.submittedAnswer).toEqual([
      { itemId: 'i1', text: 'Jeg har bodd i Tromsø.' },
    ]);
    expect(result.value.exerciseAvailable).toBe(true);
  });

  it('marks the exercise gone only on a 404, and keeps the snapshotted path', async () => {
    const { handler } = makeHandler([attempt({ id: 'a1' })], {
      exercise: Result.fail(new ContentClientError(404, 'deleted')),
    });

    const result = await run(handler, 'a1');

    expect(result.value.exerciseAvailable).toBe(false);
    expect(result.value.details).toBeNull();
    expect(result.value.path?.exercise).toBe('Perfektum');
  });

  it('does not report content-service being down as a deletion', async () => {
    const { handler } = makeHandler([attempt({ id: 'a1' })], {
      exercise: Result.fail(new ContentClientError(503, 'unavailable')),
    });

    const result = await run(handler, 'a1');

    expect(result.value.exerciseAvailable).toBe(true);
    expect(result.value.details).toBeNull();
  });

  it('carries the previous verdict onto a second try', async () => {
    const first = attempt({
      id: 'a0',
      status: 'RETURNED',
      reviewedByUserId: 'teacher-9',
      reviewedAt: new Date('2026-08-14T09:00:00Z'),
      reviewComment: 'Se på perfektum i setning 2.',
    });
    const second = attempt({
      id: 'a1',
      previousAttemptId: 'a0',
      revisionCount: 1,
    });
    const { handler } = makeHandler([first, second]);

    const result = await run(handler, 'a1');

    expect(result.value.attemptNo).toBe(2);
    expect(result.value.previous).toEqual({
      attemptId: 'a0',
      outcome: 'returned',
      at: new Date('2026-08-14T09:00:00Z'),
      reviewerId: 'teacher-9',
      comment: 'Se på perfektum i setning 2.',
    });
  });

  it('leaves previous null when the try it points at was never decided', async () => {
    const first = attempt({ id: 'a0', status: 'ABANDONED' });
    const second = attempt({ id: 'a1', previousAttemptId: 'a0', revisionCount: 1 });
    const { handler } = makeHandler([first, second]);

    expect((await run(handler, 'a1')).value.previous).toBeNull();
  });

  it('reports a colleague who already decided this one', async () => {
    const decided = attempt({
      id: 'a1',
      status: 'SCORED',
      score: 80,
      reviewedByUserId: 'teacher-2',
      reviewedAt: new Date('2026-08-16T07:00:00Z'),
      reviewComment: 'Fint!',
    });
    const { handler } = makeHandler([decided]);

    expect((await run(handler, 'a1')).value.decision).toEqual({
      attemptId: 'a1',
      outcome: 'approved',
      at: new Date('2026-08-16T07:00:00Z'),
      reviewerId: 'teacher-2',
      comment: 'Fint!',
    });
  });

  it("does not read a machine-scored attempt as somebody's verdict", async () => {
    const machine = attempt({ id: 'a1', status: 'SCORED', score: 100 });
    const { handler } = makeHandler([machine]);

    expect((await run(handler, 'a1')).value.decision).toBeNull();
  });

  it('shows a live claim and ignores a lapsed one', async () => {
    const live = attempt({
      id: 'a1',
      reviewClaimedBy: 'teacher-3',
      reviewClaimedAt: new Date(Date.now() - REVIEW_CLAIM_TTL_MS / 2),
    });
    const lapsed = attempt({
      id: 'a2',
      reviewClaimedBy: 'teacher-3',
      reviewClaimedAt: new Date(Date.now() - REVIEW_CLAIM_TTL_MS - 1000),
    });
    const { handler } = makeHandler([live, lapsed]);

    expect((await run(handler, 'a1')).value.lock?.teacherId).toBe('teacher-3');
    expect((await run(handler, 'a2')).value.lock).toBeNull();
  });

  it('lifts the essay out of a writing_task submission', async () => {
    const essay = attempt({
      id: 'a1',
      templateCode: 'writing_task',
      submittedAnswer: { text: 'Jeg bor i Oslo fordi ...', topicId: 't1' },
    });
    const { handler } = makeHandler([essay]);

    expect((await run(handler, 'a1')).value.text).toBe('Jeg bor i Oslo fordi ...');
  });

  it('costs the field, not the request, when the essay is not shaped as expected', async () => {
    const essay = attempt({ id: 'a1', templateCode: 'writing_task', submittedAnswer: 'plain' });
    const { handler } = makeHandler([essay]);

    const result = await run(handler, 'a1');
    expect(result.isFail).toBe(false);
    expect(result.value.text).toBeNull();
  });
});
