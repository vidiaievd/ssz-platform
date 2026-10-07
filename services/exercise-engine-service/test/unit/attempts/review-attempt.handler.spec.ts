import { jest } from '@jest/globals';
import { ReviewAttemptHandler } from '../../../src/modules/attempts/application/commands/review-attempt/review-attempt.handler.js';
import { ReviewAttemptCommand } from '../../../src/modules/attempts/application/commands/review-attempt/review-attempt.command.js';
import { Attempt } from '../../../src/modules/attempts/domain/entities/attempt.entity.js';
import { ReviewScoring } from '../../../src/modules/attempts/application/services/review-scoring.js';
import { Result } from '../../../src/shared/kernel/result.js';
import type { RubricSnapshot } from '@ssz/shared-kernel/writing-task';
import { sampleDocument, SAMPLE_PROMPT_IDS, setMode, snapshotOf } from '@ssz/shared-kernel/read-aloud';
import type { ReadAloudContent } from '@ssz/shared-kernel/read-aloud';

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
    axes: { skills: [], focus: [] },
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
    axes: { skills: [], focus: [] },
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
   * The verdict is over the whole submission — there is no per-item approve button in the
   * product — so approving means every item counts unless one was explicitly rejected.
   *
   * Scoring only what the machine closed would make the button mean something nobody
   * pressed. A `short_answer` set under `teacherReview: 'all'` sends every question to a
   * person by design, so three flawless answers approved by their teacher would have
   * scored 0 and reached the SRS as a failure (plan 51 §8 Q3).
   */
  it('credits every item an approval did not explicitly reject', async () => {
    const { handler } = makeHandler(routedAttempt());

    const result = await handler.execute(approve([{ itemId: 'i2', approved: true }]));

    expect(result.value.approvedItems).toBe(3);
    expect(result.value.score).toBe(100);
  });

  /**
   * The case the rule was written for: `short_answer` under `teacherReview: 'all'` routes
   * every question to a person however well it was answered, so there is nothing the
   * machine closed to score from. The teacher's approval is the whole verdict.
   */
  it('scores a submission where the machine closed nothing at all', async () => {
    const { handler } = makeHandler(routedAttempt(), {
      totalItems: 2,
      items: [
        { itemId: 'q1', routing: 'teacher', verdict: 'pass' },
        { itemId: 'q2', routing: 'teacher', verdict: 'pass' },
      ],
    });

    const result = await handler.execute(approve([]));

    expect(result.value.approvedItems).toBe(2);
    expect(result.value.score).toBe(100);
  });

  it('still withholds an item the teacher ruled against', async () => {
    const { handler } = makeHandler(routedAttempt());

    const result = await handler.execute(approve([{ itemId: 'i3', approved: false }]));

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
      score: 100,
      approvedItems: 3,
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

    // The learner is owed the answer either way — being sent back with a comment is the
    // one outcome they most need telling about.
    const [, letter] = publisher.publish.mock.calls.find(
      ([eventType]) => String(eventType) === 'exercise.attempt.reviewed',
    )!;
    expect(letter).toMatchObject({
      outcome: 'returned',
      score: null,
      comment: 'Se på perfektum.',
    });
  });

  /**
   * The work is not done and the mark is not given — and a person still read the answer
   * and judged it, which is the strongest evidence this template produces (plan 63 §4).
   * Until this event existed, only approvals reached the SRS, so everything the platform
   * knew about recall and production was what had gone right.
   */
  it('records what a person judged, even when the work goes back', async () => {
    const { handler, publisher } = makeHandler(routedAttempt());

    await handler.execute(
      new ReviewAttemptCommand(
        'att-1',
        'teacher-1',
        'returned',
        [{ itemId: 'i2', approved: true }],
        'Se på perfektum.',
      ),
    );

    const [, evidence] = publisher.publish.mock.calls.find(
      ([eventType]) => String(eventType) === 'exercise.attempt.completed',
    )!;
    expect(evidence).toMatchObject({
      userId: 'user-1',
      exerciseId: 'ex-1',
      reviewOutcome: 'returned',
      // The work is not done and did not pass, whatever partial credit it carried.
      completed: false,
      passed: false,
      // i1 was closed by the machine, i2 the teacher let stand, i3 they did not: two of
      // three, exactly as an approval would have counted them.
      score: 67,
    });
  });

  /**
   * The mirror of the approval rule, and the default is the opposite. A teacher who
   * approves credits what they did not rule against; a teacher who sends the work back
   * has not silently passed the sentences they said nothing about.
   */
  it('credits nothing an unruled sentence, when the verdict is a return', async () => {
    const { handler, publisher } = makeHandler(routedAttempt(), {
      totalItems: 2,
      items: [
        { itemId: 'q1', routing: 'teacher', verdict: 'off' },
        { itemId: 'q2', routing: 'teacher', verdict: 'off' },
      ],
    });

    await handler.execute(
      new ReviewAttemptCommand('att-1', 'teacher-1', 'returned', [], 'Skriv hele setninger.'),
    );

    const [, evidence] = publisher.publish.mock.calls.find(
      ([eventType]) => String(eventType) === 'exercise.attempt.completed',
    )!;
    expect(evidence).toMatchObject({ score: 0, reviewOutcome: 'returned' });
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
      axes: { skills: [], focus: [] },
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
  it('keeps a note on an item nobody ruled on, and does not read it as a rejection', async () => {
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

    // The note is what the teacher wanted the student to see, not a mark against them:
    // they explained the sentence and approved the work in the same breath.
    expect(result.value.approvedItems).toBe(3);
    expect(result.value.score).toBe(100);
    expect(attempt.reviewDecisions).toContainEqual({
      itemId: 'i3',
      approved: true,
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

  describe('read_aloud — a rubric per recording (plan 70 §3.6, Q1-A)', () => {
    const [P1, P2] = SAMPLE_PROMPT_IDS;

    /** Two recordings, rubric pron×2 / flow×1 / content×2 — 15 a recording, a pass at 9. */
    function recordingAttempt(doc: ReadAloudContent = sampleDocument()): Attempt {
      const attempt = Attempt.create({
        userId: 'user-1',
        exerciseId: 'ex-1',
        templateCode: 'read_aloud',
        targetLanguage: 'nb',
        difficultyLevel: 'A2',
        checkMode: 'PRACTICE',
        practicedAtoms: [],
        axes: { skills: [], focus: [] },
        itemTargets: [
          { itemKey: P1, atomType: 'VOCABULARY_ITEM', atomId: 'v-sokte', role: 'focus' },
          { itemKey: null, atomType: 'GRAMMAR_RULE_ATOM', atomId: 'g-preteritum', role: 'context' },
        ],
      });
      attempt.submit(
        {
          recordings: [
            { itemId: P1, assetId: 'a1', seconds: 22, takes: 2 },
            { itemId: P2, assetId: 'a2', seconds: 31, takes: 1 },
          ],
        },
        'hash',
      );
      attempt.routeForReview({ autoPassedItems: 0, totalItems: 2 }, snapshotOf(doc));
      attempt.clearDomainEvents();
      return attempt;
    }

    const marksFor = (p1: [number, number, number], p2: [number, number, number]) => ({
      [`${P1}:pron`]: p1[0],
      [`${P1}:flow`]: p1[1],
      [`${P1}:content`]: p1[2],
      [`${P2}:pron`]: p2[0],
      [`${P2}:flow`]: p2[1],
      [`${P2}:content`]: p2[2],
    });

    const comments = { [P1]: 'Fin kj-lyd i «Kjetil».', [P2]: 'Pass på trykket i «allerede».' };

    const verdict = (
      marks: Record<string, number>,
      notes: Record<string, string> = comments,
      comment: string | null = null,
    ) => new ReviewAttemptCommand('att-1', 'teacher-1', 'approved', [], comment, notes, marks);

    const completed = (publisher: { publish: { mock: { calls: unknown[][] } } }) =>
      publisher.publish.mock.calls.find(([type]) => type === 'exercise.attempt.completed')?.[1] as Record<
        string,
        unknown
      >;

    it('approves when every prompt reaches the threshold, scoring the percentage of the sum', async () => {
      const attempt = recordingAttempt();
      const { handler } = makeHandler(attempt);

      // 2·2 + 2 + 2·2 = 10 and 3·2 + 3 + 3·2 = 15 — both ≥ 9; 25 of 30 is 83%.
      const result = await handler.execute(verdict(marksFor([2, 2, 2], [3, 3, 3])));

      expect(result.isOk).toBe(true);
      expect(result.value).toEqual({
        attemptId: attempt.id,
        status: 'SCORED',
        score: 83,
        approvedItems: 25,
        totalItems: 30,
        rubricScore: { points: 25, max: 30, passScore: 9 },
        promptScores: [
          { itemId: P1, points: 10, max: 15, passed: true },
          { itemId: P2, points: 15, max: 15, passed: true },
        ],
      });
      expect(attempt.passed).toBe(true);
      expect(attempt.rubricMarks).toEqual(marksFor([2, 2, 2], [3, 3, 3]));
    });

    it('returns the work when one prompt falls short, however high the sum (Q1-A)', async () => {
      const attempt = recordingAttempt();
      const { handler } = makeHandler(attempt);

      // 3·2 + 3 + 3·2 = 15 and 2·2 + 0 + 2·2 = 8 — 23 of 30 is 77%, and P2 is under 9.
      const result = await handler.execute(verdict(marksFor([3, 3, 3], [2, 0, 2])));

      expect(result.value.status).toBe('RETURNED');
      expect(result.value.score).toBeNull();
      expect(attempt.status).toBe('RETURNED');
      expect(attempt.reviewDecisions).toEqual([
        { itemId: P1, approved: true, comment: comments[P1] },
        { itemId: P2, approved: false, comment: comments[P2] },
      ]);
    });

    it('accepts a return with a comment on every prompt and none on the whole (README idea 2)', async () => {
      const { handler } = makeHandler(recordingAttempt());
      const result = await handler.execute(verdict(marksFor([1, 1, 1], [1, 1, 1]), comments, null));
      expect(result.isOk).toBe(true);
      expect(result.value.status).toBe('RETURNED');
    });

    it('refuses a verdict with a prompt nobody commented on — on an approval too (RA-Q4)', async () => {
      const attempt = recordingAttempt();
      const { handler, attempts } = makeHandler(attempt);

      const result = await handler.execute(
        verdict(marksFor([3, 3, 3], [3, 3, 3]), { [P1]: 'Bra.', [P2]: '   ' }, 'Godt jobbet!'),
      );

      expect(result.isFail).toBe(true);
      expect(result.error).toEqual({ code: 'READ_ALOUD_COMMENT_REQUIRED', missing: [P2] });
      expect(attempts.save).not.toHaveBeenCalled();
      expect(attempt.status).toBe('ROUTED_FOR_REVIEW');
    });

    it('refuses a rubric with a hole, naming the mark by prompt and criterion (RA-Q3)', async () => {
      const { handler } = makeHandler(recordingAttempt());
      const marks: Record<string, number> = marksFor([2, 2, 2], [2, 2, 2]);
      delete marks[`${P2}:flow`];
      // A mark under a bare criterion id is not a mark on any prompt.
      marks['flow'] = 3;

      const result = await handler.execute(verdict(marks));

      expect(result.error).toEqual({ code: 'RUBRIC_INCOMPLETE', missing: [`${P2}:flow`] });
    });

    it('sends each prompt’s verdict to memory with its addresses, on an approval (RA-Q6)', async () => {
      const { handler, publisher } = makeHandler(recordingAttempt());
      await handler.execute(verdict(marksFor([2, 2, 2], [3, 3, 3])));

      const payload = completed(publisher);
      expect(payload['score']).toBe(83);
      expect(payload['gapResults']).toEqual([
        {
          gapKey: P1,
          correct: true,
          targets: [{ atomType: 'VOCABULARY_ITEM', atomId: 'v-sokte', role: 'focus' }],
        },
        { gapKey: P2, correct: true },
      ]);
      // Reading a given text aloud is one step weaker evidence (Q6-A).
      expect(payload['evidenceLowered']).toBe(true);
      expect(payload['targets']).toEqual([
        { atomType: 'GRAMMAR_RULE_ATOM', atomId: 'g-preteritum', role: 'context' },
      ]);
    });

    it('and on a return, which moves memory and not progress (RA-Q7)', async () => {
      const { handler, publisher } = makeHandler(recordingAttempt());
      await handler.execute(verdict(marksFor([3, 3, 3], [1, 1, 1])));

      const payload = completed(publisher);
      expect(payload['reviewOutcome']).toBe('returned');
      expect(payload['completed']).toBe(false);
      // 15 + 5 of 30.
      expect(payload['score']).toBe(67);
      expect((payload['gapResults'] as { gapKey: string; correct: boolean }[]).map((g) => [g.gapKey, g.correct])).toEqual([
        [P1, true],
        [P2, false],
      ]);
    });

    it('does not lower the evidence of a monologue', async () => {
      const { handler, publisher } = makeHandler(recordingAttempt(setMode(sampleDocument(), 'monologue')));
      await handler.execute(verdict(marksFor([3, 3, 3], [3, 3, 3])));
      expect(completed(publisher)['evidenceLowered']).toBeUndefined();
    });

    it('grades the prompts handed in, not the ones the exercise holds today', async () => {
      // A snapshot from a rubric of one criterion — the marks of the live rubric's others mean nothing.
      const doc = sampleDocument();
      doc.rubric = doc.rubric.slice(0, 1);
      const { handler } = makeHandler(recordingAttempt(doc));

      const result = await handler.execute(verdict({ [`${P1}:pron`]: 3, [`${P2}:pron`]: 2 }));

      // pron ×2: 6 of 6 and 4 of 6, threshold 9 out of reach — both prompts fail.
      expect(result.value.promptScores).toEqual([
        { itemId: P1, points: 6, max: 6, passed: false },
        { itemId: P2, points: 4, max: 6, passed: false },
      ]);
    });

    describe('a prompt carried from a returned try (phase 11b)', () => {
      const carried = {
        attemptId: 'try-1',
        attempt: 1,
        marks: { pron: 3, flow: 1, content: 3 },
        points: 13,
        max: 15,
        comment: 'Bra flyt.',
      };

      /** P1 carried as passed in try 1, P2 recorded again. */
      function secondTry(): Attempt {
        const attempt = Attempt.create({
          userId: 'user-1',
          exerciseId: 'ex-1',
          templateCode: 'read_aloud',
          targetLanguage: 'nb',
          difficultyLevel: 'A2',
          checkMode: 'PRACTICE',
          practicedAtoms: [],
          axes: { skills: [], focus: [] },
          itemTargets: [{ itemKey: P1, atomType: 'VOCABULARY_ITEM', atomId: 'v-sokte', role: 'focus' }],
        });
        attempt.submit(
          {
            recordings: [
              { itemId: P1, assetId: 'a1', seconds: 22, takes: 2, carried },
              { itemId: P2, assetId: 'b2', seconds: 30, takes: 1 },
            ],
          },
          'hash',
        );
        attempt.routeForReview({ autoPassedItems: 0, totalItems: 2 }, snapshotOf(sampleDocument()));
        attempt.clearDomainEvents();
        return attempt;
      }

      const p2 = (levels: [number, number, number]) => ({
        [`${P2}:pron`]: levels[0],
        [`${P2}:flow`]: levels[1],
        [`${P2}:content`]: levels[2],
      });

      it('asks for marks and a comment on the new prompt only', async () => {
        const { handler } = makeHandler(secondTry());

        expect((await handler.execute(verdict({}, {}))).error).toEqual({
          code: 'RUBRIC_INCOMPLETE',
          missing: [`${P2}:pron`, `${P2}:flow`, `${P2}:content`],
        });
        expect((await handler.execute(verdict(p2([3, 3, 3]), {}))).error).toEqual({
          code: 'READ_ALOUD_COMMENT_REQUIRED',
          missing: [P2],
        });
      });

      it('approves on the new prompt, the carried one standing as it was passed', async () => {
        const attempt = secondTry();
        const { handler } = makeHandler(attempt);

        // Whatever a client says about P1 is not the teacher's to change.
        const result = await handler.execute(
          verdict({ ...p2([2, 2, 2]), [`${P1}:pron`]: 0 }, { [P1]: 'Endret', [P2]: 'Mye bedre.' }),
        );

        // 13 carried + 10 new of 30 is 77%.
        expect(result.value).toMatchObject({
          status: 'SCORED',
          score: 77,
          promptScores: [
            { itemId: P1, points: 13, max: 15, passed: true, carried: true },
            { itemId: P2, points: 10, max: 15, passed: true },
          ],
        });
        expect(attempt.reviewDecisions).toEqual([
          { itemId: P1, approved: true, comment: 'Bra flyt.' },
          { itemId: P2, approved: true, comment: 'Mye bedre.' },
        ]);
        expect(attempt.rubricMarks).toEqual({
          [`${P1}:pron`]: 3,
          [`${P1}:flow`]: 1,
          [`${P1}:content`]: 3,
          ...p2([2, 2, 2]),
        });
      });

      it('tells the memory about the new prompt only — the carried pass was reported on the return', async () => {
        const { handler, publisher } = makeHandler(secondTry());
        await handler.execute(verdict(p2([2, 2, 2]), { [P2]: 'Mye bedre.' }));

        const payload = completed(publisher);
        expect(payload['score']).toBe(77);
        expect(payload['gapResults']).toEqual([{ gapKey: P2, correct: true }]);
      });

      it('returns again when the new prompt fails, keeping the carried pass', async () => {
        const attempt = secondTry();
        const { handler, publisher } = makeHandler(attempt);
        const result = await handler.execute(verdict(p2([1, 1, 1]), { [P2]: 'Fortsatt for fort.' }));

        expect(result.value.status).toBe('RETURNED');
        expect(attempt.reviewDecisions?.[0]).toEqual({ itemId: P1, approved: true, comment: 'Bra flyt.' });
        expect(completed(publisher)['gapResults']).toEqual([{ gapKey: P2, correct: false }]);
      });
    });
  });
});
