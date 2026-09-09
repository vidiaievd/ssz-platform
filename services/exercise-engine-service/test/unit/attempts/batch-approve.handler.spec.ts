import { jest } from '@jest/globals';
import { BatchApproveHandler } from '../../../src/modules/attempts/application/commands/batch-approve/batch-approve.handler.js';
import { BatchApproveCommand } from '../../../src/modules/attempts/application/commands/batch-approve/batch-approve.command.js';
import { ReviewScoring } from '../../../src/modules/attempts/application/services/review-scoring.js';
import { Attempt } from '../../../src/modules/attempts/domain/entities/attempt.entity.js';
import { Result } from '../../../src/shared/kernel/result.js';

const SCHOOL = 'school-1';

/** Everything the machine closed by itself — the only kind a batch may approve. */
const CLEAN = {
  totalItems: 2,
  items: [
    { itemId: 'i1', routing: 'pass', verdict: 'exact' },
    { itemId: 'i2', routing: 'pass', verdict: 'exact' },
  ],
};

/** The same submission after its author fixed the key: a sentence is a person's again. */
const DIRTY = {
  totalItems: 2,
  items: [
    { itemId: 'i1', routing: 'pass', verdict: 'exact' },
    { itemId: 'i2', routing: 'teacher', verdict: 'near' },
  ],
};

function routedAttempt(schoolId: string | null = SCHOOL): Attempt {
  const attempt = Attempt.create({
    userId: 'user-1',
    exerciseId: 'ex-1',
    templateCode: 'translate_to_target',
    targetLanguage: 'no',
    difficultyLevel: 'B1',
    checkMode: 'GRADED',
    practicedAtoms: [],
    axes: { skills: [], focus: [] },
  });
  attempt.snapshotReviewContext({
    schoolId,
    containerId: 'course-1',
    groupId: 'group-1',
    exercisePath: null,
    previousAttemptId: null,
    revisionCount: 0,
  });
  attempt.submit([{ itemId: 'i1', text: 'Jeg har bodd i Tromsø i tre år.' }], 'hash');
  attempt.routeForReview();
  attempt.clearDomainEvents();
  return attempt;
}

/** `rows` is keyed by attempt id; `details` by exercise id, so one batch can mix both. */
function makeHandler(rows: Record<string, Attempt | null>, details: unknown = CLEAN) {
  const attempts = {
    findById: jest.fn((id: unknown) => Promise.resolve(rows[String(id)] ?? null)),
    save: jest.fn(() => Promise.resolve()),
  };
  const validator = {
    validate: jest.fn(() =>
      Promise.resolve(Result.ok({ correct: true, score: 100, details, requiresReview: false })),
    ),
  };
  const contentClient = {
    getExerciseForAttempt: jest.fn(() =>
      Promise.resolve(
        Result.ok({
          exercise: { content: {}, expectedAnswers: {}, answerCheckSettings: null },
          template: { answerSchema: {}, defaultCheckSettings: {} },
        }),
      ),
    ),
  };
  const publisher = { publish: jest.fn(() => Promise.resolve()) };

  const handler = new BatchApproveHandler(
    attempts as never,
    new ReviewScoring(validator as never, contentClient as never),
    publisher as never,
  );
  return { handler, attempts, publisher, validator, contentClient };
}

const command = (ids: string[]) => new BatchApproveCommand(SCHOOL, 'teacher-1', ids);

describe('BatchApproveHandler', () => {
  it('approves every machine-clean submission of the list at full marks', async () => {
    const rows = { a: routedAttempt(), b: routedAttempt() };
    const { handler, attempts } = makeHandler(rows);

    const result = await handler.execute(command(['a', 'b']));

    expect(result).toEqual({ approved: 2, skipped: [] });
    expect(rows.a.status).toBe('SCORED');
    expect(rows.a.scoreValue).toBe(100);
    expect(rows.a.reviewedByUserId).toBe('teacher-1');
    expect(attempts.save).toHaveBeenCalledTimes(2);
  });

  /**
   * The reason the batch recomputes at all (plan 44 §0.3): the counters written when the
   * submission was routed said it was clean, and the exercise has changed since.
   */
  it('does not quietly credit work that stopped being clean since it was routed', async () => {
    const attempt = routedAttempt();
    const { handler, attempts, publisher } = makeHandler({ a: attempt }, DIRTY);

    const result = await handler.execute(command(['a']));

    expect(result).toEqual({ approved: 0, skipped: [{ id: 'a', reason: 'not_clean' }] });
    expect(attempt.status).toBe('ROUTED_FOR_REVIEW');
    expect(attempts.save).not.toHaveBeenCalled();
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it('marks what it can and names what it left alone', async () => {
    const decided = routedAttempt();
    decided.review({ reviewerId: 'teacher-0', outcome: 'approved', decisions: [], comment: null, score: 100 });
    const rows = { a: routedAttempt(), b: decided, c: null };

    const { handler } = makeHandler(rows);

    const result = await handler.execute(command(['a', 'b', 'c']));

    expect(result.approved).toBe(1);
    expect(result.skipped).toEqual([
      { id: 'b', reason: 'already_reviewed' },
      { id: 'c', reason: 'not_found' },
    ]);
  });

  /** A caller with no business here does not get to learn the submission exists (44.7). */
  it('treats another school’s submission as one it cannot see', async () => {
    const attempt = routedAttempt('other-school');
    const { handler, attempts } = makeHandler({ a: attempt });

    const result = await handler.execute(command(['a']));

    expect(result.skipped).toEqual([{ id: 'a', reason: 'not_found' }]);
    expect(attempts.save).not.toHaveBeenCalled();
  });

  /**
   * `writing_task` and its kind: the validator reports no items at all, so nothing has
   * been machine-checked and a batch has no business closing it.
   */
  it('refuses a free-form submission the machine never judged', async () => {
    const { handler } = makeHandler({ a: routedAttempt() }, { totalItems: 0, items: [] });

    const result = await handler.execute(command(['a']));

    expect(result).toEqual({ approved: 0, skipped: [{ id: 'a', reason: 'not_clean' }] });
  });

  it('skips a submission whose exercise it could not fetch, rather than guessing', async () => {
    const { handler, contentClient } = makeHandler({ a: routedAttempt() });
    contentClient.getExerciseForAttempt.mockResolvedValue(
      Result.fail({ code: 'CONTENT_UNAVAILABLE', message: 'boom' }) as never,
    );

    const result = await handler.execute(command(['a']));

    expect(result).toEqual({ approved: 0, skipped: [{ id: 'a', reason: 'unavailable' }] });
  });

  it('skips a submission that is not waiting for a person at all', async () => {
    const attempt = Attempt.create({
      userId: 'user-1',
      exerciseId: 'ex-1',
      templateCode: 'translate_to_target',
      targetLanguage: 'no',
      difficultyLevel: 'B1',
      checkMode: 'GRADED',
      practicedAtoms: [],
      axes: { skills: [], focus: [] },
    });
    attempt.snapshotReviewContext({
      schoolId: SCHOOL,
      containerId: null,
      groupId: null,
      exercisePath: null,
      previousAttemptId: null,
      revisionCount: 0,
    });
    const { handler } = makeHandler({ a: attempt });

    const result = await handler.execute(command(['a']));

    expect(result).toEqual({ approved: 0, skipped: [{ id: 'a', reason: 'not_pending' }] });
  });

  /**
   * Two things happened per submission and both are owed to somebody: the attempt was
   * scored, which progress and the SRS wait on, and it was answered, which the learner
   * waits on — with nothing written, since nobody wrote anything.
   */
  it('tells the learner and the rest of the platform about each verdict', async () => {
    const { handler, publisher } = makeHandler({ a: routedAttempt() });

    await handler.execute(command(['a']));

    const published = publisher.publish.mock.calls.map(([eventType]) => String(eventType));
    expect(published).toEqual(
      expect.arrayContaining(['exercise.attempt.completed', 'exercise.attempt.reviewed']),
    );

    const [, payload] = publisher.publish.mock.calls.find(
      ([eventType]) => String(eventType) === 'exercise.attempt.reviewed',
    )!;
    expect(payload).toMatchObject({
      reviewerId: 'teacher-1',
      outcome: 'approved',
      score: 100,
      hasComment: false,
      approvedItems: 2,
      totalItems: 2,
    });
  });

  /** Nobody ruled on a sentence here — the machine did, and the record says so. */
  it('records no per-item decisions, because none were made', async () => {
    const attempt = routedAttempt();
    const { handler } = makeHandler({ a: attempt });

    await handler.execute(command(['a']));

    expect(attempt.reviewDecisions).toEqual([]);
    expect(attempt.reviewComment).toBeNull();
  });

  /** The marker is advisory (44.8): it stops no single verdict, so it stops no batch. */
  it('approves a submission a colleague still has open, and clears the marker', async () => {
    const attempt = routedAttempt();
    attempt.claimForReview('teacher-2');
    const { handler } = makeHandler({ a: attempt });

    const result = await handler.execute(command(['a']));

    expect(result.approved).toBe(1);
    expect(attempt.activeReviewLock()).toBeNull();
  });
});
