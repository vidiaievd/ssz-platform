import { jest } from '@jest/globals';
import { ReviewAttemptHandler } from '../../../src/modules/attempts/application/commands/review-attempt/review-attempt.handler.js';
import { ReviewAttemptCommand } from '../../../src/modules/attempts/application/commands/review-attempt/review-attempt.command.js';
import { Attempt } from '../../../src/modules/attempts/domain/entities/attempt.entity.js';
import { ReviewScoring } from '../../../src/modules/attempts/application/services/review-scoring.js';
import { Result } from '../../../src/shared/kernel/result.js';
import type { RubricSnapshot } from '@ssz/shared-kernel/writing-task';

/**
 * Three sentences: the first hit the key and was closed by the machine, the other two are
 * why this submission is in a queue at all.
 */
const DETAILS = {
  totalItems: 3,
  items: [
    { itemId: 'i1', routing: 'pass', verdict: 'exact' },
    { itemId: 'i2', routing: 'teacher', verdict: 'near' },
    { itemId: 'i3', routing: 'teacher', verdict: 'off' },
  ],
};

function routedAttempt(): Attempt {
  const attempt = Attempt.create({
    userId: 'user-1',
    exerciseId: 'ex-1',
    templateCode: 'translate_to_target',
    targetLanguage: 'no',
    difficultyLevel: 'B1',
    checkMode: 'GRADED',
    practicedAtoms: [],
  });
  attempt.snapshotReviewContext({
    schoolId: 'school-1',
    containerId: 'course-1',
    groupId: 'group-1',
    exercisePath: { course: 'Ny i Norge — A2', module: 'Leksjon 19', exercise: 'Familien' },
    previousAttemptId: null,
    revisionCount: 0,
  });
  attempt.submit([{ itemId: 'i1', text: 'Jeg har bodd i Tromsø i tre år.' }], 'hash');
  attempt.routeForReview();
  attempt.clearDomainEvents();
  return attempt;
}

/** Four criteria weighted 2/1/1/1 — 15 points in all, a pass at 8. */
const RUBRIC: RubricSnapshot = {
  criteria: [
    { id: 'task', name: 'Oppgaveløsning', desc: '', weight: 2, levels: ['', '', '', ''] },
    { id: 'struct', name: 'Struktur', desc: '', weight: 1, levels: ['', '', '', ''] },
    { id: 'lang', name: 'Språk', desc: '', weight: 1, levels: ['', '', '', ''] },
    { id: 'lexis', name: 'Ordforråd', desc: '', weight: 1, levels: ['', '', '', ''] },
  ],
  passScore: 8,
};

function essayAttempt(rubric: RubricSnapshot | null = RUBRIC): Attempt {
  const attempt = Attempt.create({
    userId: 'user-1',
    exerciseId: 'ex-1',
    templateCode: 'writing_task',
    targetLanguage: 'no',
    difficultyLevel: 'B1',
    checkMode: 'GRADED',
    practicedAtoms: [],
  });
  attempt.submit({ text: 'Hei! Jeg skriver til deg om leiligheten.', ticked: [] }, 'hash');
  attempt.routeForReview({ autoPassedItems: 0, totalItems: 1 }, rubric);
  attempt.clearDomainEvents();
  return attempt;
}

const mark = (marks: Record<string, number>, comment: string | null = null) =>
  new ReviewAttemptCommand('att-1', 'teacher-1', 'approved', [], comment, {}, marks);

function makeHandler(attempt: Attempt | null, details: unknown = DETAILS) {
  const attempts = {
    findById: jest.fn(() => Promise.resolve(attempt)),
    save: jest.fn(() => Promise.resolve()),
  };
  const validator = {
    validate: jest.fn(() =>
      Promise.resolve(Result.ok({ correct: false, score: 0, details, requiresReview: true })),
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

  const handler = new ReviewAttemptHandler(
    attempts as never,
    new ReviewScoring(validator as never, contentClient as never),
    publisher as never,
  );
  return { handler, attempts, publisher, validator };
}

const approve = (decisions: { itemId: string; approved: boolean; comment?: string }[]) =>
  new ReviewAttemptCommand('att-1', 'teacher-1', 'approved', decisions, null);

describe('ReviewAttemptHandler', () => {
  it('scores from what the machine closed plus what the teacher approved', async () => {
    const attempt = routedAttempt();
    const { handler } = makeHandler(attempt);

    const result = await handler.execute(
      approve([
        { itemId: 'i2', approved: true },
        { itemId: 'i3', approved: false },
      ]),
    );

    expect(result.isOk).toBe(true);
    // i1 auto-passed, i2 approved, i3 not: two of three.
    expect(result.value.score).toBe(67);
    expect(result.value.approvedItems).toBe(2);
    expect(attempt.status).toBe('SCORED');
    expect(attempt.reviewedByUserId).toBe('teacher-1');
  });

  /**
   * The one mistake this template cannot afford: the learner's only feedback is a
   * person's, so a sentence nobody decided about is not a sentence quietly accepted.
   */
  it('does not approve an item the teacher said nothing about', async () => {
    const { handler } = makeHandler(routedAttempt());

    const result = await handler.execute(approve([{ itemId: 'i2', approved: true }]));

    expect(result.value.approvedItems).toBe(2);
    expect(result.value.score).toBe(67);
  });

  /**
   * Two events, because two things happened: the attempt was scored, which progress and
   * the SRS have been waiting for since it was routed, and it was answered by a person,
   * which is what the learner is waiting for.
   */
  it('publishes the scored event and the letter back to the learner', async () => {
    const { handler, publisher } = makeHandler(routedAttempt());

    await handler.execute(approve([{ itemId: 'i2', approved: true }]));

    const published = publisher.publish.mock.calls.map(([eventType]) => String(eventType));
    expect(published).toEqual(
      expect.arrayContaining(['exercise.attempt.completed', 'exercise.attempt.reviewed']),
    );

    const [, payload] = publisher.publish.mock.calls.find(
      ([eventType]) => String(eventType) === 'exercise.attempt.reviewed',
    )!;
    expect(payload).toMatchObject({
      userId: 'user-1',
      exerciseId: 'ex-1',
      reviewerId: 'teacher-1',
      outcome: 'approved',
      score: 67,
      approvedItems: 2,
      totalItems: 3,
      // What lets the message name the work and lead back to it, weeks later, without
      // asking anyone where the exercise sits now (plan 47.4).
      containerId: 'course-1',
      exercisePath: { course: 'Ny i Norge — A2', module: 'Leksjon 19', exercise: 'Familien' },
    });
  });

  it('sends a submission back without scoring it, and still says so', async () => {
    const attempt = routedAttempt();
    const { handler, publisher } = makeHandler(attempt);

    const result = await handler.execute(
      new ReviewAttemptCommand('att-1', 'teacher-1', 'returned', [], 'Se på perfektum.'),
    );

    expect(result.value.status).toBe('RETURNED');
    expect(attempt.status).toBe('RETURNED');
    expect(attempt.scoreValue).toBeNull();
    expect(attempt.reviewComment).toBe('Se på perfektum.');

    // No score to publish, but the learner is owed the answer either way — being sent
    // back with a comment is the one outcome they most need telling about.
    expect(publisher.publish).toHaveBeenCalledTimes(1);
    const [eventType, payload] = publisher.publish.mock.calls[0]!;
    expect(String(eventType)).toBe('exercise.attempt.reviewed');
    expect(payload).toMatchObject({
      outcome: 'returned',
      score: null,
      comment: 'Se på perfektum.',
    });
  });

  /**
   * A submission a colleague marked a minute ago is no longer in anyone's queue — and the
   * screen has to name them, so the refusal carries who, what and when (criterion 24).
   */
  it('reports the colleague who got there first, not merely that it is too late', async () => {
    const attempt = routedAttempt();
    attempt.review({
      reviewerId: 'teacher-0',
      outcome: 'returned',
      decisions: [],
      comment: 'Se på perfektum.',
    });
    const { handler, attempts } = makeHandler(attempt);

    const result = await handler.execute(approve([]));

    expect(result.isFail).toBe(true);
    expect(result.error).toMatchObject({
      code: 'ALREADY_REVIEWED',
      by: 'teacher-0',
      verdict: 'returned',
    });
    expect((result.error as { at: Date }).at).toBeInstanceOf(Date);
    // The verdict that arrived second changes nothing.
    expect(attempts.save).not.toHaveBeenCalled();
  });

  it('names an approval a colleague delivered, with its own outcome', async () => {
    const attempt = routedAttempt();
    attempt.review({
      reviewerId: 'teacher-0',
      outcome: 'approved',
      decisions: [{ itemId: 'i2', approved: true }],
      comment: null,
      score: 67,
    });
    const { handler } = makeHandler(attempt);

    const result = await handler.execute(approve([]));

    expect(result.error).toMatchObject({
      code: 'ALREADY_REVIEWED',
      by: 'teacher-0',
      verdict: 'approved',
    });
  });

  /**
   * A machine-scored attempt was never anybody's to conflict over: it is refused, but as
   * a submission that is not waiting for a person rather than as a colleague's verdict.
   */
  it('does not dress a machine score up as a colleague', async () => {
    const attempt = Attempt.create({
      userId: 'user-1',
      exerciseId: 'ex-1',
      templateCode: 'translate_to_target',
      targetLanguage: 'no',
      difficultyLevel: 'B1',
      checkMode: 'GRADED',
      practicedAtoms: [],
    });
    attempt.submit([{ itemId: 'i1', text: 'Jeg har bodd i Tromsø.' }], 'hash');
    attempt.score(100, true, null, null);
    const { handler } = makeHandler(attempt);

    const result = await handler.execute(approve([]));

    expect(result.isFail).toBe(true);
    expect(result.error).not.toMatchObject({ code: 'ALREADY_REVIEWED' });
  });

  it('refuses to send work back with nothing said about why', async () => {
    const attempt = routedAttempt();
    const { handler, attempts, publisher } = makeHandler(attempt);

    const result = await handler.execute(
      new ReviewAttemptCommand('att-1', 'teacher-1', 'returned', [], '   '),
    );

    expect(result.isFail).toBe(true);
    expect(result.error).toEqual({ code: 'RETURN_REQUIRES_COMMENT' });
    expect(attempt.status).toBe('ROUTED_FOR_REVIEW');
    expect(attempts.save).not.toHaveBeenCalled();
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it('folds a note on one sentence into the decision about it', async () => {
    const attempt = routedAttempt();
    const { handler } = makeHandler(attempt);

    await handler.execute(
      new ReviewAttemptCommand(
        'att-1',
        'teacher-1',
        'approved',
        [
          { itemId: 'i2', approved: true },
          { itemId: 'i3', approved: false },
        ],
        null,
        { i3: '«bor» er presens.', i2: '   ' },
      ),
    );

    expect(attempt.reviewDecisions).toEqual([
      { itemId: 'i2', approved: true },
      { itemId: 'i3', approved: false, comment: '«bor» er presens.' },
    ]);
  });

  /**
   * A remark on a sentence the teacher ruled on nowhere else is kept rather than dropped,
   * and it does not approve anything: an item nobody approved was never counted anyway,
   * so the mark is the same with the note as without it.
   */
  it('keeps a note on an item that has no decision, without approving it', async () => {
    const attempt = routedAttempt();
    const { handler } = makeHandler(attempt);

    const result = await handler.execute(
      new ReviewAttemptCommand(
        'att-1',
        'teacher-1',
        'approved',
        [{ itemId: 'i2', approved: true }],
        null,
        {
          i3: 'Denne mangler verbet.',
        },
      ),
    );

    expect(result.value.approvedItems).toBe(2);
    expect(result.value.score).toBe(67);
    expect(attempt.reviewDecisions).toContainEqual({
      itemId: 'i3',
      approved: false,
      comment: 'Denne mangler verbet.',
    });
  });

  describe('hasComment on the letter to the learner', () => {
    const reviewedPayload = (publisher: { publish: { mock: { calls: unknown[][] } } }) =>
      publisher.publish.mock.calls.find(
        ([eventType]) => String(eventType) === 'exercise.attempt.reviewed',
      )![1] as { hasComment: boolean };

    it('is false when a teacher approved with nothing to say', async () => {
      const { handler, publisher } = makeHandler(routedAttempt());

      await handler.execute(approve([{ itemId: 'i2', approved: true }]));

      expect(reviewedPayload(publisher).hasComment).toBe(false);
    });

    it('is true on an approval carrying only a note on one sentence', async () => {
      const { handler, publisher } = makeHandler(routedAttempt());

      await handler.execute(
        new ReviewAttemptCommand('att-1', 'teacher-1', 'approved', [], null, {
          i2: 'Nesten — se på ordstillingen.',
        }),
      );

      expect(reviewedPayload(publisher).hasComment).toBe(true);
    });

    it('is true when the work was sent back, which always says why', async () => {
      const { handler, publisher } = makeHandler(routedAttempt());

      await handler.execute(
        new ReviewAttemptCommand('att-1', 'teacher-1', 'returned', [], 'Se på perfektum.'),
      );

      expect(reviewedPayload(publisher).hasComment).toBe(true);
    });
  });

  describe('graded out of a rubric (plan 50 §3.2)', () => {
    it('scores the marks and normalizes the total to the percent everything else reads', async () => {
      const attempt = essayAttempt();
      const { handler } = makeHandler(attempt);

      const result = await handler.execute(mark({ task: 3, struct: 2, lang: 2, lexis: 1 }));

      expect(result.isOk).toBe(true);
      expect(result.value).toEqual({
        attemptId: attempt.id,
        status: 'SCORED',
        score: 73,
        approvedItems: 11,
        totalItems: 15,
        rubricScore: { points: 11, max: 15, passScore: 8 },
      });
      expect(attempt.scoreValue).toBe(73);
    });

    it('approves on the threshold in points even when the percentage looks like a failure', async () => {
      const attempt = essayAttempt();
      const { handler } = makeHandler(attempt);

      // 8 of 15 — a pass at passScore 8, and 53%, which the SRS would read as a failure
      // if the threshold were ever compared in percent.
      const result = await handler.execute(mark({ task: 2, struct: 2, lang: 2, lexis: 0 }));

      expect(result.value.status).toBe('SCORED');
      expect(result.value.score).toBe(53);
      expect(attempt.status).toBe('SCORED');
      expect(attempt.passed).toBe(true);
    });

    it('sends the work back when the marks fall under the threshold, whatever the client asked for', async () => {
      const attempt = essayAttempt();
      const { handler } = makeHandler(attempt);

      const result = await handler.execute(
        mark({ task: 1, struct: 2, lang: 1, lexis: 1 }, 'Se på avsnittene — teksten mangler struktur.'),
      );

      expect(result.value.status).toBe('RETURNED');
      expect(result.value.score).toBeNull();
      expect(attempt.status).toBe('RETURNED');
      // Read criterion by criterion all the same: the next draft is answering these marks.
      expect(attempt.rubricMarks).toEqual({ task: 1, struct: 2, lang: 1, lexis: 1 });
    });

    it('still refuses to send work back with nothing said about why', async () => {
      const { handler } = makeHandler(essayAttempt());

      const result = await handler.execute(mark({ task: 1, struct: 1, lang: 1, lexis: 1 }));

      expect(result.isFail).toBe(true);
      expect(result.error).toEqual({ code: 'RETURN_REQUIRES_COMMENT' });
    });

    it('refuses a rubric with a criterion left unmarked instead of scoring it as zero', async () => {
      const attempt = essayAttempt();
      const { handler, attempts } = makeHandler(attempt);

      const result = await handler.execute(mark({ task: 3, lang: 2 }));

      expect(result.isFail).toBe(true);
      expect(result.error).toEqual({ code: 'RUBRIC_INCOMPLETE', missing: ['struct', 'lexis'] });
      expect(attempts.save).not.toHaveBeenCalled();
      expect(attempt.status).toBe('ROUTED_FOR_REVIEW');
    });

    it('takes no score from the client — a mark out of range is a hole, not a grade', async () => {
      const { handler } = makeHandler(essayAttempt());

      const result = await handler.execute(mark({ task: 9, struct: 3, lang: 3, lexis: 3 }));

      expect(result.isFail).toBe(true);
      expect(result.error).toEqual({ code: 'RUBRIC_INCOMPLETE', missing: ['task'] });
    });

    it('keeps ReviewDecision[] empty — an essay has no items to decide about', async () => {
      const attempt = essayAttempt();
      const { handler } = makeHandler(attempt);

      await handler.execute(
        new ReviewAttemptCommand('att-1', 'teacher-1', 'approved', [{ itemId: 'i1', approved: false }], null, {}, {
          task: 3,
          struct: 3,
          lang: 3,
          lexis: 3,
        }),
      );

      expect(attempt.reviewDecisions).toEqual([]);
    });

    it('sends the same reviewed event, carrying the score as a percentage', async () => {
      const { handler, publisher } = makeHandler(essayAttempt());

      await handler.execute(mark({ task: 3, struct: 2, lang: 2, lexis: 1 }));

      const payload = publisher.publish.mock.calls.find(
        ([eventType]) => String(eventType) === 'exercise.attempt.reviewed',
      )![1] as { outcome: string; score: number; approvedItems: number; totalItems: number };

      expect(payload.outcome).toBe('approved');
      expect(payload.score).toBe(73);
      expect(payload.approvedItems).toBe(11);
      expect(payload.totalItems).toBe(15);
    });

    it('grades an attempt queued before rubrics existed exactly as it did before', async () => {
      const attempt = essayAttempt(null);
      const { handler } = makeHandler(attempt, { totalItems: 1, passedItems: 0 });

      const result = await handler.execute(mark({ task: 3, struct: 3, lang: 3, lexis: 3 }));

      // No snapshot, no rubric branch: the old item path, which scores an unreadable
      // breakdown on the teacher's act of approving.
      expect(result.value.status).toBe('SCORED');
      expect(result.value.score).toBe(100);
      expect(result.value.rubricScore).toBeNull();
    });
  });

  it('reports a missing attempt as missing rather than failing to mark it', async () => {
    const { handler } = makeHandler(null);

    const result = await handler.execute(approve([]));

    expect(result.isFail).toBe(true);
    expect(result.error).toEqual({ code: 'ATTEMPT_NOT_FOUND' });
  });
});
