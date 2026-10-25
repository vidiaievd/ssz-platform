import { jest } from '@jest/globals';
import { ListMySubmissionsHandler } from '../../../src/modules/attempts/application/queries/list-my-submissions/list-my-submissions.handler.js';
import { ListMySubmissionsQuery } from '../../../src/modules/attempts/application/queries/list-my-submissions/list-my-submissions.query.js';
import {
  decodeMySubmissionsCursor,
  encodeMySubmissionsCursor,
} from '../../../src/modules/attempts/application/queries/list-my-submissions/my-submissions-cursor.js';
import {
  Attempt,
  type AttemptPersistenceProps,
} from '../../../src/modules/attempts/domain/entities/attempt.entity.js';

const USER = 'student-1';

function attempt(props: Partial<AttemptPersistenceProps> = {}): Attempt {
  return Attempt.reconstitute({
    id: 'att-1',
    userId: USER,
    exerciseId: 'ex-1',
    assignmentId: null,
    enrollmentId: null,
    templateCode: 'translate_to_target',
    targetLanguage: 'no',
    difficultyLevel: 'A2',
    checkMode: 'GRADED',
    practicedAtoms: [],
    status: 'ROUTED_FOR_REVIEW',
    score: null,
    passed: null,
    timeSpentSeconds: 300,
    // Exactly what invariant 1 forbids reaching the browser — present here to prove the
    // handler's result never carries it, not because the handler is expected to read it.
    submittedAnswer: { answers: [{ itemId: 'i1', text: 'the actual answer' }] },
    validationDetails: { reference: 'do not leak me' },
    feedback: 'unreleased feedback',
    answerHash: 'hash',
    revisionCount: 0,
    recheckCount: 0,
    answersRevealed: false,
    selfChecksUsed: 0,
    startedAt: new Date('2026-08-19T08:00:00Z'),
    submittedAt: new Date('2026-08-19T09:00:00Z'),
    scoredAt: null,
    reviewedByUserId: null,
    reviewedAt: null,
    reviewComment: null,
    // Per-item reviewer notes: the learner's screen does not show these yet (plan 47 §4),
    // and this canary is what says so if a future field mapping starts carrying them.
    reviewDecisions: [{ itemId: 'i1', approved: false, comment: 'unreleased per-item note' }],
    schoolId: 'school-1',
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

function makeHandler(
  rows: Attempt[],
  latestReturned: Attempt | null = null,
  aiDrafted: string[] = [],
) {
  const attempts = {
    findMySubmissionsPage: jest.fn(() => Promise.resolve(rows)),
    findLatestReturned: jest.fn(() => Promise.resolve(latestReturned)),
    findAiDraftedIds: jest.fn((_ids: string[]) => Promise.resolve(new Set(aiDrafted))),
  };
  return { handler: new ListMySubmissionsHandler(attempts as never), attempts };
}

const query = (limit = 50) => new ListMySubmissionsQuery(USER, 'all', limit, null);

describe('ListMySubmissionsHandler', () => {
  it('maps ROUTED_FOR_REVIEW to pending, with no decision', async () => {
    const { handler } = makeHandler([attempt()]);

    const result = await handler.execute(query());

    expect(result.items).toEqual([
      {
        attemptId: 'att-1',
        exerciseId: 'ex-1',
        templateCode: 'translate_to_target',
        targetLanguage: 'no',
        exercisePath: { course: 'Ny i Norge — A2', module: 'Leksjon 19', exercise: 'Familien' },
        containerId: 'course-1',
        schoolId: 'school-1',
        submittedAt: new Date('2026-08-19T09:00:00Z'),
        status: 'pending',
        attemptNo: 1,
        decision: null,
        provisional: null,
        canResubmit: false,
      },
    ]);
  });

  it('never reads the answer or the validator output onto the result', async () => {
    const { handler } = makeHandler([attempt()]);

    const result = await handler.execute(query());
    const payload = JSON.stringify(result);

    expect(payload).not.toContain('the actual answer');
    expect(payload).not.toContain('do not leak me');
    expect(payload).not.toContain('unreleased feedback');
    expect(payload).not.toContain('unreleased per-item note');
  });

  it('maps RETURNED to returned, with the teacher’s verdict', async () => {
    const returned = attempt({
      status: 'RETURNED',
      revisionCount: 1,
      reviewedByUserId: 'teacher-1',
      reviewedAt: new Date('2026-08-19T10:00:00Z'),
      reviewComment: 'Se på perfektum.',
    });
    const { handler } = makeHandler([returned], returned);

    const result = await handler.execute(query());

    expect(result.items[0]).toMatchObject({ status: 'returned', attemptNo: 2 });
    // Exact, not partial: `decision` is where an unreleased per-item note would land if
    // one were ever mapped in, and a partial match would not notice it arriving.
    expect(result.items[0]!.decision).toEqual({
      verdict: 'returned',
      by: 'teacher',
      byUserId: 'teacher-1',
      at: new Date('2026-08-19T10:00:00Z'),
      comment: 'Se på perfektum.',
      aiDrafted: false,
    });
  });

  it('maps SCORED-with-a-reviewer to approved', async () => {
    const scored = attempt({
      status: 'SCORED',
      score: 100,
      passed: true,
      scoredAt: new Date('2026-08-19T10:00:00Z'),
      reviewedByUserId: 'teacher-1',
      reviewedAt: new Date('2026-08-19T10:00:00Z'),
    });
    const { handler } = makeHandler([scored]);

    const result = await handler.execute(query());

    expect(result.items[0]).toMatchObject({
      status: 'approved',
      decision: { verdict: 'approved', byUserId: 'teacher-1' },
    });
  });

  it('says a model’s verdict is a model’s, with nobody to name (plan 79, 2.3)', async () => {
    const scored = attempt({
      schoolId: null,
      status: 'SCORED',
      score: 67,
      passed: true,
      scoredAt: new Date('2026-10-24T10:00:00Z'),
      reviewedAt: new Date('2026-10-24T10:00:00Z'),
      reviewComment: 'Bra! Se på ordstillingen i setning 2.',
    });
    const { handler } = makeHandler([scored]);

    const result = await handler.execute(query());

    expect(result.items[0]).toMatchObject({ status: 'approved' });
    expect(result.items[0]!.decision).toEqual({
      verdict: 'approved',
      by: 'ai',
      byUserId: null,
      at: new Date('2026-10-24T10:00:00Z'),
      comment: 'Bra! Se på ordstillingen i setning 2.',
      aiDrafted: false,
    });
  });

  it('says a teacher’s verdict came from a model’s draft when one was sent or edited', async () => {
    const drafted = attempt({
      id: 'att-drafted',
      status: 'SCORED',
      score: 100,
      passed: true,
      scoredAt: new Date('2026-10-24T10:00:00Z'),
      reviewedByUserId: 'teacher-1',
      reviewedAt: new Date('2026-10-24T10:00:00Z'),
    });
    const own = attempt({
      id: 'att-own',
      status: 'SCORED',
      score: 100,
      passed: true,
      scoredAt: new Date('2026-10-24T09:00:00Z'),
      reviewedByUserId: 'teacher-1',
      reviewedAt: new Date('2026-10-24T09:00:00Z'),
    });
    const { handler } = makeHandler([drafted, own], null, ['att-drafted']);

    const result = await handler.execute(query());

    expect(result.items.find((i) => i.attemptId === 'att-drafted')?.decision?.aiDrafted).toBe(true);
    expect(result.items.find((i) => i.attemptId === 'att-own')?.decision?.aiDrafted).toBe(false);
  });

  it('asks about drafts only for rows a teacher signed', async () => {
    const signed = attempt({
      id: 'att-signed',
      status: 'RETURNED',
      reviewedByUserId: 'teacher-1',
      reviewedAt: new Date('2026-10-24T10:00:00Z'),
    });
    const byModel = attempt({
      id: 'att-model',
      schoolId: null,
      status: 'SCORED',
      scoredAt: new Date('2026-10-24T10:00:00Z'),
      reviewedAt: new Date('2026-10-24T10:00:00Z'),
    });
    const waiting = attempt({ id: 'att-waiting' });
    const { handler, attempts } = makeHandler([signed, byModel, waiting], signed);

    await handler.execute(query());

    expect(attempts.findAiDraftedIds).toHaveBeenCalledWith(['att-signed']);
  });

  it('says a model’s return is a model’s', async () => {
    const returned = attempt({
      schoolId: null,
      status: 'RETURNED',
      reviewedAt: new Date('2026-10-24T10:00:00Z'),
      reviewComment: 'Prøv igjen med perfektum.',
    });
    const { handler } = makeHandler([returned], returned);

    const result = await handler.execute(query());

    expect(result.items[0]).toMatchObject({
      status: 'returned',
      canResubmit: true,
      decision: { verdict: 'returned', by: 'ai', byUserId: null },
    });
  });

  it('offers a resend only on the RETURNED row that is actually still the latest one', async () => {
    const stale = attempt({ id: 'att-old', status: 'RETURNED', reviewedByUserId: 'teacher-1' });
    const current = attempt({ id: 'att-new', status: 'RETURNED', reviewedByUserId: 'teacher-1' });
    // A resubmit always resumes whatever `findLatestReturned` answers — here, `current`.
    const { handler, attempts } = makeHandler([current, stale], current);

    const result = await handler.execute(query());

    expect(result.items.find((i) => i.attemptId === 'att-new')?.canResubmit).toBe(true);
    expect(result.items.find((i) => i.attemptId === 'att-old')?.canResubmit).toBe(false);
    // One lookup for the shared exerciseId, not one per row.
    expect(attempts.findLatestReturned).toHaveBeenCalledTimes(1);
  });

  it('never offers a resend on a pending or approved row', async () => {
    const { handler } = makeHandler([attempt({ status: 'ROUTED_FOR_REVIEW' })]);

    const result = await handler.execute(query());

    expect(result.items[0]!.canResubmit).toBe(false);
  });

  it('pages from the row the page ended on, not from the last row it kept', async () => {
    const second = attempt({ id: 'att-2', submittedAt: new Date('2026-08-19T08:30:00Z') });
    const { handler, attempts } = makeHandler([attempt(), second]);

    const result = await handler.execute(query(1));

    expect(attempts.findMySubmissionsPage.mock.calls[0]![2]).toMatchObject({ limit: 2 });
    expect(result.items).toHaveLength(1);
    expect(decodeMySubmissionsCursor(result.nextCursor!)).toEqual({
      submittedAt: new Date('2026-08-19T09:00:00Z'),
      id: 'att-1',
    });
  });

  it('asks the repository for the page after the cursor it was given', async () => {
    const after = { submittedAt: new Date('2026-08-18T10:00:00Z'), id: 'att-0' };
    const { handler, attempts } = makeHandler([]);

    await handler.execute(
      new ListMySubmissionsQuery(
        USER,
        'all',
        50,
        decodeMySubmissionsCursor(encodeMySubmissionsCursor(after)),
      ),
    );

    expect(attempts.findMySubmissionsPage.mock.calls[0]![2]).toMatchObject({ after });
  });

  it('passes the status filter straight through to the repository', async () => {
    const { handler, attempts } = makeHandler([]);

    await handler.execute(new ListMySubmissionsQuery(USER, 'returned', 50, null));

    expect(attempts.findMySubmissionsPage).toHaveBeenCalledWith(USER, 'returned', expect.anything());
  });
});

describe('the "mine" cursor', () => {
  it('survives a round trip', () => {
    const cursor = { submittedAt: new Date('2026-08-19T09:00:00Z'), id: 'att-1' };

    expect(decodeMySubmissionsCursor(encodeMySubmissionsCursor(cursor))).toEqual(cursor);
  });

  /** Refused, not quietly answered with page one — a reader on page four cannot tell. */
  it('refuses anything this service did not issue', () => {
    expect(decodeMySubmissionsCursor('not-a-cursor')).toBeNull();
    expect(decodeMySubmissionsCursor(Buffer.from('|att-1').toString('base64url'))).toBeNull();
    expect(
      decodeMySubmissionsCursor(Buffer.from('not-a-date|att-1').toString('base64url')),
    ).toBeNull();
  });
});
