import { jest } from '@jest/globals';
import { ReviewContextResolver } from '../../../../src/modules/attempts/application/services/review-context-resolver.js';
import { SubmitAnswerHandler } from '../../../../src/modules/attempts/application/commands/submit-answer/submit-answer.handler.js';
import { SubmitAnswerCommand } from '../../../../src/modules/attempts/application/commands/submit-answer/submit-answer.command.js';
import type { IAttemptRepository } from '../../../../src/modules/attempts/domain/repositories/attempt.repository.js';
import type { IContentClient, ExerciseDefinition } from '../../../../src/shared/application/ports/content-client.port.js';
import { ContentClientError } from '../../../../src/shared/application/ports/content-client.port.js';
import type { IAnswerValidator } from '../../../../src/shared/application/ports/answer-validator.port.js';
import { ValidationError } from '../../../../src/shared/application/ports/answer-validator.port.js';
import type { IFeedbackGenerator } from '../../../../src/shared/application/ports/feedback-generator.port.js';
import type { IEventPublisher } from '../../../../src/shared/application/ports/event-publisher.port.js';
import { Result } from '../../../../src/shared/kernel/result.js';
import { Attempt } from '../../../../src/modules/attempts/domain/entities/attempt.entity.js';
import {
  emptyContent,
  toContent,
  toExpectedAnswers,
} from '@ssz/shared-kernel/writing-task';
import type { WritingTask } from '@ssz/shared-kernel/writing-task';

const makeInProgressAttempt = (templateCode = 'multiple_choice') =>
  Attempt.reconstitute({
    id: 'attempt-1',
    userId: 'user-1',
    exerciseId: 'ex-1',
    assignmentId: null,
    enrollmentId: null,
    templateCode,
    targetLanguage: 'no',
    difficultyLevel: 'A1',
    checkMode: 'PRACTICE',
    practicedAtoms: [],
    status: 'IN_PROGRESS',
    score: null,
    passed: null,
    timeSpentSeconds: 0,
    submittedAnswer: null,
    validationDetails: null,
    feedback: null,
    answerHash: null,
    revisionCount: 0,
    startedAt: new Date(),
    submittedAt: null,
    scoredAt: null,
  });

const makeExerciseDef = (): ExerciseDefinition => ({
  exercise: {
    id: 'ex-1',
    templateCode: 'multiple_choice',
    targetLanguage: 'no',
    difficultyLevel: 'A1',
    content: {},
    expectedAnswers: { correct_option_ids: ['A'] },
    answerCheckSettings: null,
  },
  template: {
    code: 'multiple_choice',
    contentSchema: {},
    answerSchema: { type: 'object' },
    defaultCheckSettings: {},
    supportedLanguages: null,
  },
  instruction: null,
});

const makeWritingTaskDef = (): ExerciseDefinition => {
  const document = {
    ...emptyContent(),
    id: 'ex-1',
    type: 'writing_task',
    moduleId: 'mod-1',
    title: 'Leserinnlegg',
    updatedAt: '',
  } as WritingTask;

  return {
    exercise: {
      id: 'ex-1',
      templateCode: 'writing_task',
      targetLanguage: 'no',
      difficultyLevel: 'A1',
      content: toContent(document) as unknown as Record<string, unknown>,
      expectedAnswers: toExpectedAnswers(document) as unknown as Record<string, unknown>,
      answerCheckSettings: null,
    },
    template: {
      code: 'writing_task',
      contentSchema: {},
      answerSchema: { type: 'object' },
      defaultCheckSettings: {},
      supportedLanguages: null,
    },
    instruction: null,
  };
};

const makeRepo = (attempt: Attempt | null = makeInProgressAttempt()): jest.Mocked<IAttemptRepository> => ({
  findById: jest.fn<IAttemptRepository['findById']>().mockResolvedValue(attempt),
  findInProgress: jest.fn<IAttemptRepository['findInProgress']>(),
  findAllByUser: jest.fn<IAttemptRepository['findAllByUser']>(),
  save: jest.fn<IAttemptRepository['save']>().mockResolvedValue(undefined),
});

const makeContentClient = (result = Result.ok(makeExerciseDef())): jest.Mocked<IContentClient> => ({
  getExerciseForAttempt: jest.fn<IContentClient['getExerciseForAttempt']>().mockResolvedValue(result),
  getPracticedAtoms: jest
    .fn<IContentClient['getPracticedAtoms']>()
    .mockResolvedValue(Result.ok([])),
  getExercisePlacement: jest
    .fn<IContentClient['getExercisePlacement']>()
    .mockResolvedValue(
      Result.ok({
        containerId: 'course-1',
        containerTitle: 'Ny i Norge A2',
        moduleId: 'mod-1',
        moduleTitle: 'Leksjon 7',
        exerciseTitle: 'Perfektum',
        ownerSchoolId: 'school-1',
      }),
    ),
});

const makeReviewContext = (content: IContentClient) =>
  new ReviewContextResolver(content as any, {
    getMemberRole: jest.fn(),
    resolveStudentGroup: jest
      .fn()
      .mockResolvedValue(Result.ok({ groupId: 'group-1', groupName: 'A2 Kveld' })),
  } as any);

const makeValidator = (outcome = { correct: true, score: 100, details: null, requiresReview: false }): jest.Mocked<IAnswerValidator> => ({
  validate: jest.fn<IAnswerValidator['validate']>().mockResolvedValue(Result.ok(outcome)),
});

const makeFeedback = (): jest.Mocked<IFeedbackGenerator> => ({
  generate: jest.fn<IFeedbackGenerator['generate']>().mockResolvedValue(
    Result.ok({ summary: 'Correct!' }),
  ),
});

const makePublisher = (): jest.Mocked<IEventPublisher> => ({
  publish: jest.fn<IEventPublisher['publish']>().mockResolvedValue(undefined),
});

const makeHandler = (
  repo: IAttemptRepository,
  content: IContentClient,
  validator: IAnswerValidator,
  feedback: IFeedbackGenerator,
  publisher: IEventPublisher,
) => new SubmitAnswerHandler(
  repo as any, content as any, validator as any,
  feedback as any, publisher as any,
  makeReviewContext(content),
);

const cmd = new SubmitAnswerCommand('attempt-1', 'user-1', { correct_option_ids: ['A'] }, 30, 'no');

const GAP_FILL_DETAILS = {
  totalGaps: 1,
  correctGaps: 0,
  gaps: [{ gapKey: 's1#3', correct: false, explanation: 'Etter «vil gjerne» kommer infinitiv.' }],
};

/**
 * As `MatchPairsValidator` writes them. Note what is *not* here: the `rightId` of the
 * correct half, the `why`, and any row of the feedback matrix the student did not hit.
 * The student attached the wrong half and gets told why that half is wrong — which is
 * the entire reason this template exists.
 */
const MATCH_PAIRS_DETAILS = {
  totalPairs: 2,
  correctPairs: 1,
  pairs: [
    { pairId: 'p1', correct: true, explanation: null },
    { pairId: 'p2', correct: false, explanation: 'Etter «fordi» star verbet etter subjektet.' },
  ],
};

/** As the translate validator writes them: for the teacher queue, key included. */
const TRANSLATE_DETAILS = {
  totalItems: 2,
  routedItems: 1,
  passedItems: 1,
  items: [
    {
      itemId: 'i1',
      verdict: 'exact',
      similarity: 1,
      ref: 'Jeg har bodd i Tromsø i tre år.',
      submitted: 'Jeg har bodd i Tromsø i tre år.',
      tokens: [],
      missing: [],
      banned: [],
      routing: 'pass',
    },
    {
      itemId: 'i2',
      verdict: 'near',
      similarity: 0.71,
      ref: 'Jeg liker katter.',
      submitted: 'Jeg elsker katter.',
      tokens: [{ t: 'missing', w: 'liker', typo: null }],
      missing: [{ text: 'liker', note: 'Oppgaven øver på «liker».' }],
      banned: [],
      routing: 'teacher',
    },
  ],
};

/**
 * As the short-answer validator writes them: every element carries the anchor phrase that
 * matched, which is the answer in the words the student was asked to find.
 *
 * `teacherReview: 'flagged'` — one question closed by the check, one sent on. Note that
 * `passedItems` counts the closed one, not the passing one: the two are the same number
 * here and part company under `teacherReview: 'all'`.
 */
const SHORT_ANSWER_DETAILS = {
  totalItems: 2,
  routedItems: 1,
  passedItems: 1,
  coveredElements: 2,
  totalElements: 3,
  items: [
    {
      itemId: 'q1',
      prompt: 'Hva må alle syklister ha?',
      submitted: 'Alle må ha lys foran og bak.',
      verdict: 'pass',
      covered: 1,
      total: 1,
      tooShort: false,
      words: 6,
      elements: [{ id: 'e1', label: 'lys', required: true, hit: true, anchor: 'lys foran' }],
      model: 'Alle syklister må ha lys foran og bak.',
      routing: 'pass',
    },
    {
      itemId: 'q2',
      prompt: 'Er det lurt å sykle om vinteren?',
      submitted: 'Nei. Kanskje.',
      verdict: 'partial',
      covered: 1,
      total: 2,
      tooShort: true,
      words: 2,
      elements: [
        { id: 'e2', label: 'nei', required: true, hit: true, anchor: 'nei' },
        { id: 'e3', label: 'glatt', required: true, hit: false, anchor: null },
      ],
      model: 'Nei, fordi det er glatt om vinteren.',
      routing: 'teacher',
    },
  ],
};

const makeGapFillAttempt = () => makeInProgressAttempt('word_bank_gap_fill');

const makeGapFillDef = (): ExerciseDefinition => {
  const def = makeExerciseDef();
  def.exercise.templateCode = 'word_bank_gap_fill';
  def.exercise.content = {
    sentences: [{ id: 's1', text: 'Jeg vil gjerne bestille en kaffe.', gaps: [3] }],
    distractors: ['bestilt'],
    settings: {
      shuffle: true,
      allowReuse: false,
      showBankCount: true,
      caseSensitive: false,
      input: 'bank',
    },
  };
  return def;
};

describe('SubmitAnswerHandler', () => {
  it('returns ATTEMPT_NOT_FOUND when attempt does not exist', async () => {
    const handler = makeHandler(
      makeRepo(null), makeContentClient(), makeValidator(),
      makeFeedback(), makePublisher(),
    );
    const result = await handler.execute(cmd);
    expect(result.isFail).toBe(true);
    expect((result.error as any).code).toBe('ATTEMPT_NOT_FOUND');
  });

  it('returns FORBIDDEN when attempt belongs to a different user', async () => {
    const attempt = makeInProgressAttempt();
    const wrongUserCmd = new SubmitAnswerCommand('attempt-1', 'other-user', { correct_option_ids: ['A'] }, 30, 'no');
    const handler = makeHandler(
      makeRepo(attempt), makeContentClient(), makeValidator(),
      makeFeedback(), makePublisher(),
    );
    const result = await handler.execute(wrongUserCmd);
    expect(result.isFail).toBe(true);
    expect((result.error as any).code).toBe('FORBIDDEN');
  });

  it('returns ContentClientError when exercise fetch fails', async () => {
    const handler = makeHandler(
      makeRepo(),
      makeContentClient(Result.fail(new ContentClientError(503, 'Service unavailable'))),
      makeValidator(), makeFeedback(), makePublisher(),
    );
    const result = await handler.execute(cmd);
    expect(result.isFail).toBe(true);
    expect(result.error).toBeInstanceOf(ContentClientError);
  });

  it('returns ValidationError on schema mismatch', async () => {
    const validator = makeValidator();
    validator.validate.mockResolvedValue(
      Result.fail(new ValidationError('SCHEMA_MISMATCH', 'Bad answer')),
    );
    const handler = makeHandler(
      makeRepo(), makeContentClient(), validator,
      makeFeedback(), makePublisher(),
    );
    const result = await handler.execute(cmd);
    expect(result.isFail).toBe(true);
    expect(result.error).toBeInstanceOf(ValidationError);
    expect((result.error as ValidationError).code).toBe('SCHEMA_MISMATCH');
  });

  it('closed-form: scores attempt and publishes the completed event', async () => {
    const repo = makeRepo();
    const publisher = makePublisher();
    const handler = makeHandler(
      repo, makeContentClient(),
      makeValidator({ correct: true, score: 100, details: null, requiresReview: false }),
      makeFeedback(), publisher,
    );
    const result = await handler.execute(cmd);

    expect(result.isOk).toBe(true);
    expect(result.value.correct).toBe(true);
    expect(result.value.score).toBe(100);
    expect(result.value.requiresReview).toBe(false);
    expect(repo.save).toHaveBeenCalled();
    expect(publisher.publish).toHaveBeenCalledWith(
      'exercise.attempt.completed',
      expect.objectContaining({ userId: 'user-1', exerciseId: 'ex-1', score: 100, completed: true }),
    );
  });

  it('closed-form: sets passed=false when score below threshold', async () => {
    const repo = makeRepo();
    const handler = makeHandler(
      repo, makeContentClient(),
      makeValidator({ correct: false, score: 40, details: null, requiresReview: false }),
      makeFeedback(), makePublisher(),
    );
    const result = await handler.execute(cmd);
    expect(result.isOk).toBe(true);
    expect(result.value.correct).toBe(false);
    expect(result.value.score).toBe(40);
  });

  describe('multiple_choice — what the submission is not trusted about at all', () => {
    // Plan 53 §3.5. Which try a question was taken on *is* the score — only a
    // first-attempt hit counts — and the client has no business asserting it. Every pick
    // reached the server through `answer-question` as it was made, so the whole list is
    // replaced rather than patched.
    const pickedAttempt = () => {
      const attempt = makeInProgressAttempt('multiple_choice');
      attempt.pickOption({ questionId: 'q1', optionId: 'o2', correct: false, closed: false, revealed: false });
      attempt.pickOption({ questionId: 'q1', optionId: 'o1', correct: true, closed: true, revealed: false });
      attempt.pickOption({ questionId: 'q2', optionId: 'p2', correct: false, closed: false, revealed: false });
      attempt.pickOption({ questionId: 'q2', optionId: null, correct: false, closed: true, revealed: true });
      return attempt;
    };

    const submit = (answers: unknown) =>
      new SubmitAnswerCommand('attempt-1', 'user-1', { answers }, 30, 'no');

    it('replaces the claimed picks with what the attempt recorded', async () => {
      const validator = makeValidator();
      const handler = makeHandler(
        makeRepo(pickedAttempt()), makeContentClient(), validator,
        makeFeedback(), makePublisher(),
      );

      // The client claims both questions right on the first try. Neither is.
      await handler.execute(
        submit([
          { questionId: 'q1', optionId: 'o1', attempt: 1 },
          { questionId: 'q2', optionId: 'p1', attempt: 1 },
        ]),
      );

      const submitted = validator.validate.mock.calls[0]?.[0].submittedAnswer as {
        answers: Array<{ questionId: string; optionId: string | null; attempt: number }>;
      };
      expect(submitted.answers).toEqual([
        // Right, but on the second try — so it scores nothing.
        { questionId: 'q1', optionId: 'o1', attempt: 2 },
        // Revealed: the answer was shown to them, so it is not theirs to submit.
        { questionId: 'q2', optionId: null, attempt: 1 },
      ]);
    });

    it('leaves a submission alone when the attempt recorded no picks', async () => {
      // A document of the old form, submitted the way it always was.
      const validator = makeValidator();
      const answer = { correct_option_ids: ['a'] };
      const handler = makeHandler(
        makeRepo(makeInProgressAttempt('multiple_choice')), makeContentClient(), validator,
        makeFeedback(), makePublisher(),
      );

      await handler.execute(new SubmitAnswerCommand('attempt-1', 'user-1', answer, 30, 'no'));

      expect(validator.validate.mock.calls[0]?.[0].submittedAnswer).toEqual(answer);
    });
  });

  describe('sentence_schema — what the submission is not trusted about', () => {
    // Plan 52 §3.4: `Vis riktig skjema` puts the answer on the board, and a revealed
    // sentence scores nothing. The reveal is recorded on the attempt when it happens, so
    // a client submitting the board it was just shown with the flag left off does not get
    // to keep the marks.
    const revealedAttempt = () => {
      const attempt = makeInProgressAttempt('sentence_schema');
      attempt.checkRow({ rowId: 'r1', placement: {}, solved: false, revealed: true });
      return attempt;
    };

    const submit = (rows: unknown) =>
      new SubmitAnswerCommand('attempt-1', 'user-1', { rows }, 30, 'no');

    it('writes the recorded reveal over what the client claims', async () => {
      const validator = makeValidator();
      const handler = makeHandler(
        makeRepo(revealedAttempt()), makeContentClient(), validator,
        makeFeedback(), makePublisher(),
      );

      await handler.execute(
        submit([
          { rowId: 'r1', placement: { 'f-sub': ['c1'] }, revealed: false },
          { rowId: 'r2', placement: { 'f-sub': ['d1'] }, revealed: false },
        ]),
      );

      const submitted = validator.validate.mock.calls[0]?.[0].submittedAnswer as {
        rows: Array<{ rowId: string; revealed: boolean }>;
      };
      expect(submitted.rows).toEqual([
        { rowId: 'r1', placement: { 'f-sub': ['c1'] }, revealed: true },
        { rowId: 'r2', placement: { 'f-sub': ['d1'] }, revealed: false },
      ]);
    });

    it('leaves a submission alone when nothing was revealed', async () => {
      const validator = makeValidator();
      const rows = [{ rowId: 'r1', placement: { 'f-sub': ['c1'] }, revealed: false }];
      const handler = makeHandler(
        makeRepo(makeInProgressAttempt('sentence_schema')), makeContentClient(), validator,
        makeFeedback(), makePublisher(),
      );

      await handler.execute(submit(rows));

      expect(validator.validate.mock.calls[0]?.[0].submittedAnswer).toEqual({ rows });
    });

    it('leaves every other template’s submission untouched', async () => {
      const validator = makeValidator();
      const handler = makeHandler(
        makeRepo(), makeContentClient(), validator, makeFeedback(), makePublisher(),
      );

      await handler.execute(cmd);

      expect(validator.validate.mock.calls[0]?.[0].submittedAnswer).toEqual({
        correct_option_ids: ['A'],
      });
    });
  });

  describe('routing for review (plan 44 §44.5)', () => {
    it('fills in the review context the attempt started without', async () => {
      const repo = makeRepo();
      const handler = makeHandler(
        repo, makeContentClient(),
        makeValidator({ correct: false, score: 0, details: null, requiresReview: true }),
        makeFeedback(), makePublisher(),
      );

      await handler.execute(cmd);

      const saved = repo.save.mock.calls[0]![0];
      expect(saved.schoolId).toBe('school-1');
      expect(saved.containerId).toBe('course-1');
      expect(saved.groupId).toBe('group-1');
    });

    it('records the validator tally so the queue does not have to recompute it', async () => {
      const repo = makeRepo();
      const handler = makeHandler(
        repo, makeContentClient(),
        makeValidator({
          correct: false,
          score: 0,
          details: { totalItems: 5, passedItems: 4, items: [] },
          requiresReview: true,
        }),
        makeFeedback(), makePublisher(),
      );

      await handler.execute(cmd);

      const saved = repo.save.mock.calls[0]![0];
      expect(saved.autoPassedItems).toBe(4);
      expect(saved.totalItems).toBe(5);
    });

    it('freezes the rubric a writing task will be graded against', async () => {
      const repo = makeRepo(makeInProgressAttempt('writing_task'));
      const handler = makeHandler(
        repo, makeContentClient(Result.ok(makeWritingTaskDef())),
        makeValidator({ correct: false, score: 0, details: null, requiresReview: true }),
        makeFeedback(), makePublisher(),
      );

      await handler.execute(cmd);

      const snapshot = repo.save.mock.calls[0]![0].rubricSnapshot;
      expect(snapshot?.passScore).toBe(8);
      expect(snapshot?.criteria).toHaveLength(4);
      // The descriptors come with it: they live in `expected_answers`, and the queue
      // draws them beside each mark.
      expect(snapshot?.criteria[0]!.levels[3]).not.toBe('');
      // Marks are the teacher's, and nobody has marked anything yet.
      expect(repo.save.mock.calls[0]![0].rubricMarks).toBeNull();
    });

    it('leaves the rubric empty for the templates that are graded per item', async () => {
      const repo = makeRepo();
      const handler = makeHandler(
        repo, makeContentClient(),
        makeValidator({ correct: false, score: 0, details: null, requiresReview: true }),
        makeFeedback(), makePublisher(),
      );

      await handler.execute(cmd);

      expect(repo.save.mock.calls[0]![0].rubricSnapshot).toBeNull();
    });

    it('counts an undecidable single answer as one item the machine did not close', async () => {
      const repo = makeRepo();
      const handler = makeHandler(
        repo, makeContentClient(),
        makeValidator({ correct: false, score: 0, details: null, requiresReview: true }),
        makeFeedback(), makePublisher(),
      );

      await handler.execute(cmd);

      const saved = repo.save.mock.calls[0]![0];
      expect(saved.autoPassedItems).toBe(0);
      expect(saved.totalItems).toBe(1);
    });

    it('announces the submission for review alongside the frozen completed event', async () => {
      const publisher = makePublisher();
      const handler = makeHandler(
        makeRepo(), makeContentClient(),
        makeValidator({ correct: false, score: 0, details: null, requiresReview: true }),
        makeFeedback(), publisher,
      );

      await handler.execute(cmd);

      expect(publisher.publish).toHaveBeenCalledWith(
        'exercise.attempt.routed_for_review',
        expect.objectContaining({
          attemptId: 'attempt-1',
          userId: 'user-1',
          exerciseId: 'ex-1',
          schoolId: 'school-1',
          containerId: 'course-1',
          groupId: 'group-1',
        }),
      );
    });
  });

  it('free-form: routes for review, publishes completed with completed=false', async () => {
    const repo = makeRepo();
    const publisher = makePublisher();
    const handler = makeHandler(
      repo, makeContentClient(),
      makeValidator({ correct: false, score: 0, details: null, requiresReview: true }),
      makeFeedback(), publisher,
    );
    const result = await handler.execute(cmd);

    expect(result.isOk).toBe(true);
    expect(result.value.requiresReview).toBe(true);
    expect(result.value.score).toBeNull();
    expect(publisher.publish).toHaveBeenCalledWith(
      'exercise.attempt.completed',
      expect.objectContaining({ completed: false, score: null }),
    );
  });

  it('hands back the per-gap verdicts for gap-fill, which is what the learner is owed', async () => {
    const handler = makeHandler(
      makeRepo(makeGapFillAttempt()),
      makeContentClient(Result.ok(makeGapFillDef())),
      makeValidator({ correct: false, score: 0, details: GAP_FILL_DETAILS, requiresReview: false }),
      makeFeedback(), makePublisher(),
    );

    const result = await handler.execute(cmd);

    expect(result.isOk).toBe(true);
    expect(result.value.details).toEqual(GAP_FILL_DETAILS);
  });

  it('hands back the per-pair verdicts for match_pairs, explanations and all', async () => {
    const handler = makeHandler(
      makeRepo(makeInProgressAttempt('match_pairs')),
      makeContentClient(),
      makeValidator({ correct: false, score: 50, details: MATCH_PAIRS_DETAILS, requiresReview: false }),
      makeFeedback(), makePublisher(),
    );

    const result = await handler.execute(cmd);

    expect(result.isOk).toBe(true);
    expect(result.value.details).toEqual(MATCH_PAIRS_DETAILS);
  });

  it('withholds details for every other template, whose details carry the answer', async () => {
    const handler = makeHandler(
      makeRepo(), makeContentClient(),
      makeValidator({
        correct: false,
        score: 0,
        // multiple_choice reports what the right option was.
        details: { correct_selected: 0, expected: ['A'] },
        requiresReview: false,
      }),
      makeFeedback(), makePublisher(),
    );

    const result = await handler.execute(cmd);

    expect(result.isOk).toBe(true);
    expect(result.value.details).toBeUndefined();
  });

  it('translate: hands back which sentences were routed, and nothing that spells the key', async () => {
    const handler = makeHandler(
      makeRepo(makeInProgressAttempt('translate_to_target')),
      makeContentClient(),
      makeValidator({
        correct: false,
        score: 0,
        details: TRANSLATE_DETAILS,
        // The template's normal ending: one sentence hit the key, the other goes to a
        // teacher, and the whole submission is therefore routed.
        requiresReview: true,
      }),
      makeFeedback(), makePublisher(),
    );

    const result = await handler.execute(cmd);

    expect(result.isOk).toBe(true);
    expect(result.value.details).toEqual({
      totalItems: 2,
      passedItems: 1,
      items: [
        { itemId: 'i1', routing: 'pass' },
        { itemId: 'i2', routing: 'teacher' },
      ],
    });
    // The key, the diff against it and the rules it tripped stay with the teacher.
    expect(JSON.stringify(result.value.details)).not.toContain('Jeg');
  });

  it('short_answer: hands back the verdicts and the tally, and never an anchor phrase', async () => {
    const handler = makeHandler(
      makeRepo(makeInProgressAttempt('short_answer')),
      makeContentClient(),
      makeValidator({
        correct: false,
        score: 0,
        details: SHORT_ANSWER_DETAILS,
        requiresReview: true,
      }),
      makeFeedback(), makePublisher(),
    );

    const result = await handler.execute(cmd);

    expect(result.isOk).toBe(true);
    expect(result.value.details).toEqual({
      totalItems: 2,
      passedItems: 1,
      routedItems: 1,
      // Counted from the verdicts here, not taken from `passedItems`: that field counts
      // what the check closed, which is a different question from how the student did.
      verdicts: { pass: 1, partial: 1, fail: 0 },
      items: [
        { itemId: 'q1', verdict: 'pass', covered: 1, total: 1, tooShort: false, routing: 'pass' },
        {
          itemId: 'q2',
          verdict: 'partial',
          covered: 1,
          total: 2,
          tooShort: true,
          routing: 'teacher',
        },
      ],
    });
    // The element labels, the phrases that matched them and the author's model answer are
    // the key written out, and none of them travel.
    const wire = JSON.stringify(result.value.details);
    expect(wire).not.toContain('lys foran');
    expect(wire).not.toContain('glatt');
  });
});
