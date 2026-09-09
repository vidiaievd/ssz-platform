import { jest } from '@jest/globals';
import { ListReviewQueueV2Handler } from '../../../src/modules/attempts/application/queries/list-review-queue-v2/list-review-queue-v2.handler.js';
import { ListReviewQueueV2Query } from '../../../src/modules/attempts/application/queries/list-review-queue-v2/list-review-queue-v2.query.js';
import {
  decodeReviewQueueCursor,
  encodeReviewQueueCursor,
} from '../../../src/modules/attempts/application/queries/list-review-queue-v2/review-queue-cursor.js';
import { Attempt } from '../../../src/modules/attempts/domain/entities/attempt.entity.js';

const SCOPE = { schoolId: 'school-1', groupIds: ['group-1'] };

interface WaitingProps {
  id: string;
  exerciseId: string;
  userId: string;
  submittedAt: string;
  autoPassedItems?: number | null;
  totalItems?: number | null;
  revisionCount?: number;
  reviewClaimedBy?: string | null;
  reviewClaimedAt?: Date | null;
}

function waiting(props: WaitingProps): Attempt {
  return Attempt.reconstitute({
    id: props.id,
    userId: props.userId,
    exerciseId: props.exerciseId,
    assignmentId: null,
    enrollmentId: null,
    templateCode: 'translate_to_target',
    targetLanguage: 'no',
    difficultyLevel: 'B1',
    checkMode: 'GRADED',
    practicedAtoms: [],
    status: 'ROUTED_FOR_REVIEW',
    score: null,
    passed: null,
    timeSpentSeconds: 60,
    submittedAnswer: [{ itemId: 'i1', text: 'Jeg har bodd i Tromsø.' }],
    validationDetails: null,
    feedback: null,
    answerHash: 'hash',
    revisionCount: props.revisionCount ?? 0,
    recheckCount: 0,
    answersRevealed: false,
    selfChecksUsed: 0,
    startedAt: new Date(props.submittedAt),
    submittedAt: new Date(props.submittedAt),
    scoredAt: null,
    reviewedByUserId: null,
    reviewedAt: null,
    reviewComment: null,
    reviewDecisions: null,
    schoolId: 'school-1',
    containerId: 'course-1',
    groupId: 'group-1',
    exercisePath: { course: 'Ny i Norge A2', module: 'Leksjon 7', exercise: 'Perfektum' },
    reviewClaimedBy: props.reviewClaimedBy ?? null,
    reviewClaimedAt: props.reviewClaimedAt ?? null,
    previousAttemptId: null,
    autoPassedItems: props.autoPassedItems ?? null,
    totalItems: props.totalItems ?? null,
  });
}

function makeHandler(page: Attempt[], summaryPending = page.length) {
  const attempts = {
    findReviewQueuePage: jest.fn(() => Promise.resolve(page)),
    summariseReviewQueue: jest.fn(() =>
      Promise.resolve({
        pending: summaryPending,
        oldestSubmittedAt: page[0]?.submittedAt ?? null,
      }),
    ),
  };

  return { handler: new ListReviewQueueV2Handler(attempts as never), attempts };
}

describe('ListReviewQueueV2Handler', () => {
  it('groups a page by exercise, oldest group and oldest submission first', async () => {
    const { handler } = makeHandler([
      waiting({ id: 'a1', exerciseId: 'ex-2', userId: 'u1', submittedAt: '2026-08-10T08:00:00Z' }),
      waiting({ id: 'a2', exerciseId: 'ex-1', userId: 'u2', submittedAt: '2026-08-11T08:00:00Z' }),
      waiting({ id: 'a3', exerciseId: 'ex-2', userId: 'u3', submittedAt: '2026-08-12T08:00:00Z' }),
    ]);

    const result = await handler.execute(new ListReviewQueueV2Query(SCOPE, 'exercise', 50, null));

    // ex-2 first because its oldest submission is older, not because it has more.
    expect(result.groups.map((g) => g.key)).toEqual(['ex-2', 'ex-1']);
    expect(result.groups[0]!.items.map((i) => i.attemptId)).toEqual(['a1', 'a3']);
    expect(result.groups[0]!.count).toBe(2);
    expect(result.groups[0]!.containerId).toBe('course-1');
    expect(result.groups[0]!.path).toEqual({
      course: 'Ny i Norge A2',
      module: 'Leksjon 7',
      exercise: 'Perfektum',
    });
    // Every age, not an aggregate — the histogram cannot be rebuilt from a summary.
    expect(result.groups[0]!.submittedAt).toHaveLength(2);
  });

  it('groups by learner without claiming their submissions share an exercise', async () => {
    const { handler } = makeHandler([
      waiting({ id: 'a1', exerciseId: 'ex-1', userId: 'u1', submittedAt: '2026-08-10T08:00:00Z' }),
      waiting({ id: 'a2', exerciseId: 'ex-2', userId: 'u1', submittedAt: '2026-08-11T08:00:00Z' }),
    ]);

    const result = await handler.execute(new ListReviewQueueV2Query(SCOPE, 'student', 50, null));

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]!.key).toBe('u1');
    expect(result.groups[0]!.kind).toBe('student');
    expect(result.groups[0]!.exerciseId).toBeNull();
    expect(result.groups[0]!.path).toBeNull();
    // The exercise still travels on the item, which is where it belongs here.
    expect(result.groups[0]!.items.map((i) => i.exerciseId)).toEqual(['ex-1', 'ex-2']);
  });

  it('asks for one row past the page and reports the last one it kept as the cursor', async () => {
    const rows = [
      waiting({ id: 'a1', exerciseId: 'ex-1', userId: 'u1', submittedAt: '2026-08-10T08:00:00Z' }),
      waiting({ id: 'a2', exerciseId: 'ex-1', userId: 'u2', submittedAt: '2026-08-11T08:00:00Z' }),
      waiting({ id: 'a3', exerciseId: 'ex-1', userId: 'u3', submittedAt: '2026-08-12T08:00:00Z' }),
    ];
    const { handler, attempts } = makeHandler(rows);

    const result = await handler.execute(new ListReviewQueueV2Query(SCOPE, 'exercise', 2, null));

    expect(attempts.findReviewQueuePage).toHaveBeenCalledWith(SCOPE, { limit: 3, after: null });
    expect(result.groups[0]!.items.map((i) => i.attemptId)).toEqual(['a1', 'a2']);
    expect(decodeReviewQueueCursor(result.nextCursor!)).toEqual({
      submittedAt: new Date('2026-08-11T08:00:00Z'),
      id: 'a2',
    });
  });

  it('ends the paging when the extra row is not there', async () => {
    const { handler } = makeHandler([
      waiting({ id: 'a1', exerciseId: 'ex-1', userId: 'u1', submittedAt: '2026-08-10T08:00:00Z' }),
    ]);

    const result = await handler.execute(new ListReviewQueueV2Query(SCOPE, 'exercise', 2, null));

    expect(result.nextCursor).toBeNull();
  });

  it('counts the whole scope in the summary, not the page', async () => {
    const { handler } = makeHandler(
      [
        waiting({
          id: 'a1',
          exerciseId: 'ex-1',
          userId: 'u1',
          submittedAt: '2026-08-10T08:00:00Z',
        }),
      ],
      27,
    );

    const result = await handler.execute(new ListReviewQueueV2Query(SCOPE, 'exercise', 50, null));

    expect(result.summary.pending).toBe(27);
    expect(result.summary.oldestSubmittedAt).toEqual(new Date('2026-08-10T08:00:00Z'));
  });

  it('calls a submission machine-clean only when both counters agree', async () => {
    const { handler } = makeHandler([
      waiting({
        id: 'clean',
        exerciseId: 'ex-1',
        userId: 'u1',
        submittedAt: '2026-08-10T08:00:00Z',
        autoPassedItems: 4,
        totalItems: 4,
      }),
      waiting({
        id: 'partial',
        exerciseId: 'ex-1',
        userId: 'u2',
        submittedAt: '2026-08-10T09:00:00Z',
        autoPassedItems: 3,
        totalItems: 4,
      }),
      // Routed before the counters existed: no information is not "the machine closed it".
      waiting({
        id: 'legacy',
        exerciseId: 'ex-1',
        userId: 'u3',
        submittedAt: '2026-08-10T10:00:00Z',
      }),
    ]);

    const result = await handler.execute(new ListReviewQueueV2Query(SCOPE, 'exercise', 50, null));

    expect(result.groups[0]!.autoCleanIds).toEqual(['clean']);
    expect(result.groups[0]!.items.map((i) => i.autoClean)).toEqual([true, false, false]);
  });

  it('drops a claim that has aged out and keeps one that has not', async () => {
    const now = Date.now();
    const { handler } = makeHandler([
      waiting({
        id: 'held',
        exerciseId: 'ex-1',
        userId: 'u1',
        submittedAt: '2026-08-10T08:00:00Z',
        reviewClaimedBy: 'teacher-2',
        reviewClaimedAt: new Date(now - 60_000),
      }),
      waiting({
        id: 'stale',
        exerciseId: 'ex-1',
        userId: 'u2',
        submittedAt: '2026-08-10T09:00:00Z',
        reviewClaimedBy: 'teacher-3',
        reviewClaimedAt: new Date(now - 20 * 60_000),
      }),
    ]);

    const result = await handler.execute(new ListReviewQueueV2Query(SCOPE, 'exercise', 50, null));

    expect(result.groups[0]!.items[0]!.lock).toEqual({
      teacherId: 'teacher-2',
      expiresAt: new Date(now - 60_000 + 15 * 60_000),
    });
    expect(result.groups[0]!.items[1]!.lock).toBeNull();
  });

  it('numbers a resubmission as the try it is', async () => {
    const { handler } = makeHandler([
      waiting({
        id: 'a1',
        exerciseId: 'ex-1',
        userId: 'u1',
        submittedAt: '2026-08-10T08:00:00Z',
        revisionCount: 1,
      }),
    ]);

    const result = await handler.execute(new ListReviewQueueV2Query(SCOPE, 'exercise', 50, null));

    expect(result.groups[0]!.items[0]!.attemptNo).toBe(2);
  });

  it('passes the cursor down as the row to resume after', async () => {
    const { handler, attempts } = makeHandler([]);
    const after = { submittedAt: new Date('2026-08-10T08:00:00Z'), id: 'a1' };

    await handler.execute(new ListReviewQueueV2Query(SCOPE, 'exercise', 50, after));

    expect(attempts.findReviewQueuePage).toHaveBeenCalledWith(SCOPE, { limit: 51, after });
  });
});

describe('review queue cursor', () => {
  it('survives a round trip', () => {
    const cursor = { submittedAt: new Date('2026-08-10T08:00:00.123Z'), id: 'a-1' };

    expect(decodeReviewQueueCursor(encodeReviewQueueCursor(cursor))).toEqual(cursor);
  });

  it.each([
    '',
    'not-a-cursor',
    Buffer.from('|a1').toString('base64url'),
    Buffer.from('2026-08-10T08:00:00Z').toString('base64url'),
  ])('refuses %p rather than silently starting over', (raw) => {
    expect(decodeReviewQueueCursor(raw)).toBeNull();
  });
});
