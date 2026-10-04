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
import { MultipleChoiceGroupValidator } from '../../../../src/infrastructure/validation/validators/multiple-choice-group.validator.js';
import { SortIntoBucketsValidator } from '../../../../src/infrastructure/validation/validators/sort-into-buckets.validator.js';
import { HighlightInTextValidator } from '../../../../src/infrastructure/validation/validators/highlight-in-text.validator.js';
import { InvalidAttemptTransitionError } from '../../../../src/modules/attempts/domain/exceptions/attempt.errors.js';
import {
  tokenize as htTokenize,
  toContent as htToContent,
  toExpectedAnswers as htToExpectedAnswers,
} from '@ssz/shared-kernel/highlight-in-text';
import type { HighlightInTextContent, Settings as HtSettings } from '@ssz/shared-kernel/highlight-in-text';

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
        ownerUserId: 'author-1',
      }),
    ),
});

const makeReviewContext = (content: IContentClient) =>
  new ReviewContextResolver(content as any, {
    getMemberRole: jest.fn(),
    resolveLearnerReviewContext: jest
      .fn()
      .mockResolvedValue(
        Result.ok({ schoolId: 'school-1', groupId: 'group-1', groupName: 'A2 Kveld' }),
      ),
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

  /*
    Plan 56 §3.3. The transcript of a listening exercise is what the clip says, so it is
    withheld by the student projection and delivered by whatever delivers the key. For a
    template this service grades, that is the verdict — and the hand-in is the end of the
    exercise, so there is nothing left to give away.
  */
  describe('the transcript of a listening exercise', () => {
    const listening = (transcriptWhen: string) => {
      const def = makeExerciseDef();
      return {
        ...def,
        exercise: {
          ...def.exercise,
          content: {
            audio: {
              enabled: true,
              source: 'asset',
              assetId: 'asset-1',
              title: 'Dialog',
              transcript: 'Hei, jeg har vondt i halsen.',
              translation: 'Hi, my throat hurts.',
              settings: { transcriptWhen },
            },
          },
        },
      };
    };

    it('comes back with the verdict when the teacher chose "after"', async () => {
      const handler = makeHandler(
        makeRepo(), makeContentClient(Result.ok(listening('after'))),
        makeValidator({ correct: true, score: 100, details: null, requiresReview: false }),
        makeFeedback(), makePublisher(),
      );
      const result = await handler.execute(cmd);

      expect(result.isOk).toBe(true);
      expect(result.value.audioTranscript).toEqual({
        transcript: 'Hei, jeg har vondt i halsen.',
        translation: 'Hi, my throat hurts.',
      });
    });

    it('does not come back when it travelled with the document already', async () => {
      // `always` is the accommodation path and was served with the projection; sending it
      // twice would say the two copies could differ.
      const handler = makeHandler(
        makeRepo(), makeContentClient(Result.ok(listening('always'))),
        makeValidator({ correct: true, score: 100, details: null, requiresReview: false }),
        makeFeedback(), makePublisher(),
      );
      const result = await handler.execute(cmd);
      expect(result.value.audioTranscript).toBeUndefined();
    });

    it('never comes back when the teacher chose "never"', async () => {
      const handler = makeHandler(
        makeRepo(), makeContentClient(Result.ok(listening('never'))),
        makeValidator({ correct: true, score: 100, details: null, requiresReview: false }),
        makeFeedback(), makePublisher(),
      );
      const result = await handler.execute(cmd);
      expect(result.value.audioTranscript).toBeUndefined();
    });

    it('is absent from an exercise that has no audio at all', async () => {
      const handler = makeHandler(
        makeRepo(), makeContentClient(),
        makeValidator({ correct: true, score: 100, details: null, requiresReview: false }),
        makeFeedback(), makePublisher(),
      );
      const result = await handler.execute(cmd);
      expect(result.value.audioTranscript).toBeUndefined();
    });
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


// ── multiple_choice_group ───────────────────────────────────────────────────
//
// The one template whose *re*-check is the point. Plan 54 §3.3: the unit of submission is
// the whole table, so `reopenForRecheck` — written for `word_bank_gap_fill` and unlimited
// ever since — is exactly the mechanism, and what this phase adds to it is a budget and a
// freeze. Three of the grader's inputs are the attempt's facts rather than the client's
// claims, and this is where they are written over the submission.
//
// The real validator runs here rather than a mock: what is being tested is the seam
// between the two, and a mock would agree with whatever the handler sent it.

const MCG_CONTENT = {
  title: 'Tekst 1A',
  instruction: 'Er påstandene riktige eller gale?',
  source: { mode: 'none', label: '', text: '' },
  columns: [
    { id: 'c1', label: 'Riktig', short: 'R' },
    { id: 'c2', label: 'Galt', short: 'G' },
  ],
  rows: [
    { id: 'r1', text: 'Bartek er snekker.' },
    { id: 'r2', text: 'Bartek søker jobb i Oslo.' },
    { id: 'r3', text: 'Bartek har jobbet i tre år.' },
    { id: 'r4', text: 'Bartek bor i Bergen.' },
  ],
  settings: {
    numbering: true,
    shuffleRows: false,
    layout: 'auto',
    showText: true,
    retry: 'one',
    lockCorrect: true,
    showWhy: 'wrong',
    revealKey: true,
    passThreshold: 70,
    progress: true,
  },
};

const MCG_KEY = {
  rows: {
    r1: { answer: 'c1', why: 'Første setning.', quote: '' },
    r2: { answer: 'c2', why: 'Bergen, ikke Oslo.', quote: '' },
    r3: { answer: 'c1', why: 'Teksten sier tre år.', quote: '' },
    r4: { answer: 'c1', why: 'Han søker der.', quote: '' },
  },
};

const makeMcgDef = (
  settings: Record<string, unknown> = MCG_CONTENT.settings,
): ExerciseDefinition => ({
  exercise: {
    id: 'ex-1',
    templateCode: 'multiple_choice_group',
    targetLanguage: 'no',
    difficultyLevel: 'A1',
    content: { ...MCG_CONTENT, settings } as unknown as Record<string, unknown>,
    expectedAnswers: MCG_KEY as unknown as Record<string, unknown>,
    answerCheckSettings: null,
  },
  template: {
    code: 'multiple_choice_group',
    contentSchema: {},
    answerSchema: { type: 'object' },
    defaultCheckSettings: { allow_partial_credit: true },
    supportedLanguages: null,
  },
  instruction: null,
});

const makeMcgAttempt = (
  over: { status?: 'IN_PROGRESS' | 'SCORED'; validationDetails?: unknown; recheckCount?: number } = {},
) =>
  Attempt.reconstitute({
    id: 'attempt-1',
    userId: 'user-1',
    exerciseId: 'ex-1',
    assignmentId: null,
    enrollmentId: null,
    templateCode: 'multiple_choice_group',
    targetLanguage: 'no',
    difficultyLevel: 'A1',
    checkMode: 'PRACTICE',
    practicedAtoms: [],
    status: over.status ?? 'IN_PROGRESS',
    score: over.status === 'SCORED' ? 50 : null,
    passed: over.status === 'SCORED' ? false : null,
    timeSpentSeconds: 0,
    submittedAnswer: null,
    validationDetails: over.validationDetails ?? null,
    feedback: null,
    answerHash: null,
    revisionCount: 0,
    recheckCount: over.recheckCount ?? 0,
    startedAt: new Date(),
    submittedAt: over.status === 'SCORED' ? new Date() : null,
    scoredAt: over.status === 'SCORED' ? new Date() : null,
  });

/** The real grader, behind the port the handler talks to. */
const mcgValidator = (): IAnswerValidator => {
  const inner = new MultipleChoiceGroupValidator();
  return {
    validate: jest
      .fn<IAnswerValidator['validate']>()
      .mockImplementation(async (input) => inner.validate(input as never)),
  };
};

const runMcg = async (
  attempt: Attempt,
  answers: Record<string, string>,
  extra: Record<string, unknown> = {},
  def: ExerciseDefinition = makeMcgDef(),
) => {
  const repo = makeRepo(attempt);
  const content = makeContentClient(Result.ok(def));
  const handler = makeHandler(repo, content, mcgValidator(), makeFeedback(), makePublisher());
  const result = await handler.execute(
    new SubmitAnswerCommand('attempt-1', 'user-1', { answers, ...extra }, 30, 'no'),
  );
  return { result, attempt, repo };
};

interface McgDetails {
  totalItems: number;
  attempt: number;
  attemptsLeft: number;
  closed: boolean;
  locked: string[];
  items: Array<{ itemId: string; submitted: string | null; correct: boolean; firstAnswer: string | null; keyColumnId?: string }>;
}

describe('SubmitAnswerHandler — multiple_choice_group', () => {
  it('checks the whole table and hands the verdicts back to the runner', async () => {
    const { result } = await runMcg(makeMcgAttempt(), {
      r1: 'c1',
      r2: 'c1',
      r3: 'c1',
      r4: 'c2',
    });

    expect(result.isOk).toBe(true);
    const details = result.value.details as McgDetails;
    expect(details.attempt).toBe(1);
    expect(details.attemptsLeft).toBe(1);
    expect(details.closed).toBe(false);
    expect(details.locked.sort()).toEqual(['r1', 'r3']);
    expect(result.value.score).toBe(50);
  });

  it('numbers the second check itself rather than believing the client', async () => {
    // A client sending `attempt: 1` on its second go would buy back the retry it spent.
    const attempt = makeMcgAttempt({
      status: 'SCORED',
      validationDetails: { closed: false, locked: ['r1'], items: [] },
    });

    const { result } = await runMcg(attempt, { r1: 'c1', r2: 'c2', r3: 'c1', r4: 'c1' }, { attempt: 1 });

    const details = result.value.details as McgDetails;
    expect(details.attempt).toBe(2);
    expect(details.attemptsLeft).toBe(0);
    expect(details.closed).toBe(true);
    expect(attempt.recheckCount).toBe(1);
  });

  it('answers a frozen row from the key, whatever the second submission says', async () => {
    const attempt = makeMcgAttempt({
      status: 'SCORED',
      validationDetails: {
        closed: false,
        locked: ['r1', 'r3'],
        items: [
          { itemId: 'r1', firstAnswer: 'c1' },
          { itemId: 'r2', firstAnswer: 'c1' },
          { itemId: 'r3', firstAnswer: 'c1' },
          { itemId: 'r4', firstAnswer: 'c2' },
        ],
      },
    });

    // The client tries to change a locked row to the wrong column.
    const { result } = await runMcg(attempt, { r1: 'c2', r2: 'c2', r3: 'c2', r4: 'c1' });

    const details = result.value.details as McgDetails;
    expect(details.items.find((r) => r.itemId === 'r1')).toMatchObject({
      submitted: 'c1',
      correct: true,
    });
    expect(details.items.find((r) => r.itemId === 'r3')).toMatchObject({
      submitted: 'c1',
      correct: true,
    });
    expect(result.value.score).toBe(100);
  });

  it('carries the first answer per row across the re-check', async () => {
    // Plan 54 §8 Q4. The first pass is what says whether the cohort understood the text,
    // and `score()` overwrites `validationDetails` — so it is copied forward rather than
    // read back out of a record that no longer exists.
    const attempt = makeMcgAttempt({
      status: 'SCORED',
      validationDetails: {
        closed: false,
        locked: ['r3', 'r4'],
        items: [
          { itemId: 'r1', firstAnswer: 'c2' },
          { itemId: 'r2', firstAnswer: 'c1' },
          { itemId: 'r3', firstAnswer: 'c1' },
          { itemId: 'r4', firstAnswer: 'c1' },
        ],
      },
    });

    const { result } = await runMcg(attempt, { r1: 'c1', r2: 'c2', r3: 'c1', r4: 'c1' });

    const details = result.value.details as McgDetails;
    const corrected = details.items.find((r) => r.itemId === 'r1')!;
    expect(corrected.submitted).toBe('c1');
    expect(corrected.correct).toBe(true);
    expect(corrected.firstAnswer).toBe('c2');
    expect(details.items.find((r) => r.itemId === 'r2')!.firstAnswer).toBe('c1');
  });

  it('refuses a second check when the author allowed none', async () => {
    const attempt = makeMcgAttempt({
      status: 'SCORED',
      validationDetails: { closed: false, locked: [], items: [] },
    });

    const { result } = await runMcg(
      attempt,
      { r1: 'c1', r2: 'c2', r3: 'c1', r4: 'c1' },
      {},
      makeMcgDef({ ...MCG_CONTENT.settings, retry: 'none' }),
    );

    expect(result.isFail).toBe(true);
    expect(attempt.status).toBe('SCORED');
    expect(attempt.recheckCount).toBe(0);
  });

  it('refuses a check on a table the last one closed', async () => {
    // Closing happens for three reasons and only one of them spends the budget. Without
    // this, a student who pressed «Vis fasit» could spend the unspent retry on the
    // answers they had just been shown.
    const attempt = makeMcgAttempt({
      status: 'SCORED',
      validationDetails: { closed: true, locked: [], items: [] },
    });

    const { result } = await runMcg(attempt, { r1: 'c1', r2: 'c2', r3: 'c1', r4: 'c1' });

    expect(result.isFail).toBe(true);
    expect(attempt.recheckCount).toBe(0);
  });

  it('marks the attempt against the pass mark the author set, not the platform default', async () => {
    // 75% passes the platform's 70 and fails this table's «all or nothing».
    const attempt = makeMcgAttempt();

    await runMcg(
      attempt,
      { r1: 'c1', r2: 'c2', r3: 'c1', r4: 'c2' },
      {},
      makeMcgDef({ ...MCG_CONTENT.settings, passThreshold: 100 }),
    );

    expect(attempt.scoreValue).toBe(75);
    expect(attempt.passed).toBe(false);
  });

  it('tells the SRS about the first check and nothing after it', async () => {
    const first = makeMcgAttempt();
    const { repo: firstRepo } = await runMcg(first, { r1: 'c1', r2: 'c1', r3: 'c1', r4: 'c1' });
    expect(firstRepo.save).toHaveBeenCalled();
    expect(first.recheckCount).toBe(0);

    const again = makeMcgAttempt({
      status: 'SCORED',
      validationDetails: { closed: false, locked: [], items: [] },
    });
    const publisher = makePublisher();
    const handler = makeHandler(
      makeRepo(again),
      makeContentClient(Result.ok(makeMcgDef())),
      mcgValidator(),
      makeFeedback(),
      publisher,
    );
    await handler.execute(
      new SubmitAnswerCommand('attempt-1', 'user-1', { answers: { r1: 'c1', r2: 'c2', r3: 'c1', r4: 'c1' } }, 30, 'no'),
    );

    // `AttemptScoredEvent` is raised only while `recheckCount === 0` (plan 54 §3.3): the
    // SRS sees the first pass, whatever a correction does to the number on screen.
    expect(publisher.publish).not.toHaveBeenCalledWith(
      'attempt.scored',
      expect.anything(),
    );
  });
});


// ── sort_into_buckets ───────────────────────────────────────────────────────
//
// Plan 66. The board is checked whole with `multiple_choice_group`'s machinery — a budget
// of checks, a frozen set, the first placement carried forward — and the real validator
// runs behind the port for the reason given above: what is under test is the seam.

const SB_SETTINGS = { shuffle: false, showRemaining: false, hints: true, revealKey: true, attempts: 2, threshold: 70 };

const SB_CONTENT = {
  title: 'Kjønn',
  instruction: 'Sorter substantivene.',
  buckets: [
    { id: 'b1', label: 'en', rule: 'Hankjønn.' },
    { id: 'b2', label: 'et', rule: 'Intetkjønn.' },
  ],
  useNone: false,
  noneLabel: '',
  items: [
    { id: 'i1', text: 'bil' },
    { id: 'i2', text: 'gutt' },
    { id: 'i3', text: 'hus' },
    { id: 'i4', text: 'eple' },
  ],
  settings: SB_SETTINGS,
};

const SB_KEY = {
  items: {
    i1: { bucketId: 'b1', also: [], why: 'En bil.', fb: { def: 'Bil er hankjønn.', ov: {} } },
    i2: { bucketId: 'b1', also: [], why: 'En gutt.', fb: { def: 'Gutt er hankjønn.', ov: {} } },
    i3: { bucketId: 'b2', also: [], why: 'Et hus.', fb: { def: 'Hus er intetkjønn.', ov: {} } },
    i4: { bucketId: 'b2', also: [], why: 'Et eple.', fb: { def: 'Eple er intetkjønn.', ov: {} } },
  },
};

const RIGHT_PLACEMENTS = [
  { itemId: 'i1', bucketId: 'b1' },
  { itemId: 'i2', bucketId: 'b1' },
  { itemId: 'i3', bucketId: 'b2' },
  { itemId: 'i4', bucketId: 'b2' },
];

const makeSbDef = (settings: Record<string, unknown> = SB_SETTINGS): ExerciseDefinition => ({
  exercise: {
    id: 'ex-1',
    templateCode: 'sort_into_buckets',
    targetLanguage: 'nb',
    difficultyLevel: 'A1',
    content: { ...SB_CONTENT, settings } as unknown as Record<string, unknown>,
    expectedAnswers: SB_KEY as unknown as Record<string, unknown>,
    answerCheckSettings: null,
  },
  template: {
    code: 'sort_into_buckets',
    contentSchema: {},
    answerSchema: { type: 'object' },
    defaultCheckSettings: {},
    supportedLanguages: null,
  },
  instruction: null,
});

const makeSbAttempt = (
  over: { status?: 'IN_PROGRESS' | 'SCORED'; validationDetails?: unknown; recheckCount?: number } = {},
) =>
  Attempt.reconstitute({
    id: 'attempt-1',
    userId: 'user-1',
    exerciseId: 'ex-1',
    assignmentId: null,
    enrollmentId: null,
    templateCode: 'sort_into_buckets',
    targetLanguage: 'nb',
    difficultyLevel: 'A1',
    checkMode: 'PRACTICE',
    practicedAtoms: [],
    status: over.status ?? 'IN_PROGRESS',
    score: over.status === 'SCORED' ? 50 : null,
    passed: over.status === 'SCORED' ? false : null,
    timeSpentSeconds: 0,
    submittedAnswer: null,
    validationDetails: over.validationDetails ?? null,
    feedback: null,
    answerHash: null,
    revisionCount: 0,
    recheckCount: over.recheckCount ?? 0,
    startedAt: new Date(),
    submittedAt: over.status === 'SCORED' ? new Date() : null,
    scoredAt: over.status === 'SCORED' ? new Date() : null,
  });

const sbValidator = (): IAnswerValidator => {
  const inner = new SortIntoBucketsValidator();
  return {
    validate: jest
      .fn<IAnswerValidator['validate']>()
      .mockImplementation(async (input) => inner.validate(input as never)),
  };
};

const runSb = async (
  attempt: Attempt,
  placements: Array<{ itemId: string; bucketId: string }>,
  extra: Record<string, unknown> = {},
  def: ExerciseDefinition = makeSbDef(),
) => {
  const publisher = makePublisher();
  const handler = makeHandler(
    makeRepo(attempt),
    makeContentClient(Result.ok(def)),
    sbValidator(),
    makeFeedback(),
    publisher,
  );
  const result = await handler.execute(
    new SubmitAnswerCommand('attempt-1', 'user-1', { placements, ...extra }, 30, 'nb'),
  );
  return { result, attempt, publisher };
};

interface SbDetails {
  attempt: number;
  checksLeft: number | null;
  closed: boolean;
  locked: string[];
  correctNow: number;
  rules: Array<{ bucketId: string; rule: string }>;
  items: Array<{
    itemId: string;
    chosenBucketId: string | null;
    correct: boolean;
    firstAnswer: string | null;
    explanation?: string;
    correctBucketId?: string;
    why?: string;
  }>;
}

/** The first check's details, as `score()` would have left them on the attempt. */
const afterFirstCheck = (firstAnswers: Record<string, string | null>, locked: string[]) => ({
  closed: false,
  locked,
  items: Object.entries(firstAnswers).map(([itemId, firstAnswer]) => ({ itemId, firstAnswer })),
});

describe('SubmitAnswerHandler — sort_into_buckets', () => {
  it('scores the first check over every item, an unplaced one counting as wrong (AC-S12)', async () => {
    const { result, attempt } = await runSb(makeSbAttempt(), RIGHT_PLACEMENTS.slice(0, 2));

    expect(result.isOk).toBe(true);
    expect(result.value.score).toBe(50);
    expect(attempt.passed).toBe(false);
    const details = result.value.details as SbDetails;
    expect(details).toMatchObject({ attempt: 1, checksLeft: 1, closed: false });
    expect(details.locked.sort()).toEqual(['i1', 'i2']);
  });

  it('explains a wrong tile and withholds the key while a check is left (AC-S4)', async () => {
    const placements = [{ itemId: 'i1', bucketId: 'b2' }, ...RIGHT_PLACEMENTS.slice(1)];
    const { result } = await runSb(makeSbAttempt(), placements);

    const details = result.value.details as SbDetails;
    const wrong = details.items.find((i) => i.itemId === 'i1')!;
    expect(wrong).toMatchObject({ correct: false, explanation: 'Bil er hankjønn.' });
    for (const item of details.items) {
      expect(item).not.toHaveProperty('correctBucketId');
      expect(item).not.toHaveProperty('why');
    }
    expect(details.rules).toEqual([]);
  });

  it('keeps the first check as the score when a re-check fixes the board', async () => {
    const attempt = makeSbAttempt({
      status: 'SCORED',
      validationDetails: afterFirstCheck({ i1: 'b2', i2: 'b1', i3: 'b2', i4: 'b2' }, ['i2', 'i3', 'i4']),
    });

    const { result } = await runSb(attempt, RIGHT_PLACEMENTS, { attempt: 1 });

    const details = result.value.details as SbDetails;
    // Numbered by the server, not by the client's `attempt: 1`.
    expect(details.attempt).toBe(2);
    expect(details.correctNow).toBe(4);
    expect(details.closed).toBe(true);
    expect(details.items.find((i) => i.itemId === 'i1')!.firstAnswer).toBe('b2');
    expect(result.value.score).toBe(75);
    // Closed with the key on: now the answers and the rules come.
    expect(details.items.find((i) => i.itemId === 'i1')).toMatchObject({ correctBucketId: 'b1', why: 'En bil.' });
    expect(details.rules.map((r) => r.bucketId)).toEqual(['b1', 'b2']);
  });

  it('keeps a locked tile where it was right, whatever is resent', async () => {
    const attempt = makeSbAttempt({
      status: 'SCORED',
      validationDetails: afterFirstCheck({ i1: 'b1', i2: 'b2', i3: 'b2', i4: 'b2' }, ['i1', 'i3', 'i4']),
    });

    const moved = [
      { itemId: 'i1', bucketId: 'b2' },
      { itemId: 'i2', bucketId: 'b2' },
      { itemId: 'i3', bucketId: 'b2' },
      { itemId: 'i4', bucketId: 'b2' },
    ];
    const { result } = await runSb(attempt, moved);

    const details = result.value.details as SbDetails;
    expect(details.items.find((i) => i.itemId === 'i1')).toMatchObject({ chosenBucketId: 'b1', correct: true });
  });

  it('refuses a check beyond the budget (AC-S6)', async () => {
    const attempt = makeSbAttempt({
      status: 'SCORED',
      validationDetails: afterFirstCheck({ i1: 'b2', i2: 'b1', i3: 'b2', i4: 'b2' }, []),
    });

    const { result } = await runSb(attempt, RIGHT_PLACEMENTS, {}, makeSbDef({ ...SB_SETTINGS, attempts: 1 }));

    expect(result.isFail).toBe(true);
    expect(attempt.recheckCount).toBe(0);
  });

  it('refuses a check on a board the last one closed', async () => {
    const attempt = makeSbAttempt({
      status: 'SCORED',
      validationDetails: { ...afterFirstCheck({ i1: 'b1' }, []), closed: true },
    });

    const { result } = await runSb(attempt, RIGHT_PLACEMENTS, {}, makeSbDef({ ...SB_SETTINGS, attempts: 0 }));

    expect(result.isFail).toBe(true);
  });

  it('a reveal closes the board, shows the key and fails the attempt (AC-S8)', async () => {
    const { result, attempt } = await runSb(makeSbAttempt(), RIGHT_PLACEMENTS.slice(0, 3), { reveal: true });

    const details = result.value.details as SbDetails;
    expect(details.closed).toBe(true);
    expect(details.items.every((i) => i.correctBucketId !== undefined)).toBe(true);
    expect(attempt.passed).toBe(false);
  });

  it("passes against the author's threshold, not the platform default", async () => {
    const attempt = makeSbAttempt();
    await runSb(attempt, RIGHT_PLACEMENTS.slice(0, 3), {}, makeSbDef({ ...SB_SETTINGS, threshold: 75 }));
    expect(attempt.scoreValue).toBe(75);
    expect(attempt.passed).toBe(true);
  });

  it('sends the scheduler a verdict per item, keyed by item id (Q3-A, AC-X5)', async () => {
    const placements = [{ itemId: 'i1', bucketId: 'b2' }, ...RIGHT_PLACEMENTS.slice(1, 3)];
    const { publisher } = await runSb(makeSbAttempt(), placements);

    const completed = publisher.publish.mock.calls.find(([type]) => type === 'exercise.attempt.completed');
    expect(completed).toBeDefined();
    const payload = completed![1] as { gapResults?: Array<{ gapKey: string; correct: boolean }> };
    expect(payload.gapResults).toEqual([
      { gapKey: 'i1', correct: false },
      { gapKey: 'i2', correct: true },
      { gapKey: 'i3', correct: true },
      { gapKey: 'i4', correct: false },
    ]);
  });

  it('writes the failed attempt as scored, so progress is recorded (AC-X3)', async () => {
    const { attempt, publisher } = await runSb(makeSbAttempt(), []);
    expect(attempt.status).toBe('SCORED');
    expect(attempt.scoreValue).toBe(0);
    expect(publisher.publish.mock.calls.some(([type]) => type === 'exercise.attempt.completed')).toBe(true);
  });
});

describe('SubmitAnswerHandler — sort_into_buckets lowers its evidence (plan 66, Q2-B)', () => {
  const completedPayload = (publisher: ReturnType<typeof makePublisher>) =>
    publisher.publish.mock.calls.find(([type]) => type === 'exercise.attempt.completed')![1] as {
      evidenceLowered?: boolean;
    };

  it('says nothing on an ordinary board', async () => {
    const { publisher } = await runSb(makeSbAttempt(), RIGHT_PLACEMENTS);
    expect(completedPayload(publisher)).not.toHaveProperty('evidenceLowered');
  });

  it('lowers it while the counter is on — read from the document, not the client', async () => {
    const { publisher } = await runSb(
      makeSbAttempt(),
      RIGHT_PLACEMENTS,
      { counterShown: false },
      makeSbDef({ ...SB_SETTINGS, showRemaining: true }),
    );
    expect(completedPayload(publisher).evidenceLowered).toBe(true);
  });

  it('lowers it on a skewed board', async () => {
    const skewed: ExerciseDefinition = {
      ...makeSbDef(),
      exercise: {
        ...makeSbDef().exercise,
        content: {
          ...SB_CONTENT,
          items: [...SB_CONTENT.items, { id: 'i5', text: 'mann' }, { id: 'i6', text: 'stol' }],
        } as unknown as Record<string, unknown>,
        expectedAnswers: {
          items: {
            ...SB_KEY.items,
            i3: { ...SB_KEY.items.i3, bucketId: 'b1' },
            i5: { bucketId: 'b1', also: [], why: '', fb: { def: 'd', ov: {} } },
            i6: { bucketId: 'b1', also: [], why: '', fb: { def: 'd', ov: {} } },
          },
        } as unknown as Record<string, unknown>,
      },
    };
    const { publisher } = await runSb(makeSbAttempt(), RIGHT_PLACEMENTS, {}, skewed);
    expect(completedPayload(publisher).evidenceLowered).toBe(true);
  });
});

// ── highlight_in_text ───────────────────────────────────────────────────────
//
// Plan 67, Q1-A. One attempt, one question per submit. The states of the questions live in
// the attempt's own details and are carried from submit to submit; the evidence is
// published once, on the submit that closes the last question. The real validator runs
// behind the port and one attempt object goes through every submit of a test, so what is
// under test is the seam as it really turns: reopen, overwrite, grade, score, publish.

const HT_TEXT = 'I fjor sommer reiste vi til Bodø. Der bodde vi hos tante Kari og spiste fisk.';

/** The character range of the first token spelling `word`. */
const htAt = (word: string) => {
  const token = htTokenize(HT_TEXT).find((t) => t.w === word);
  if (!token) throw new Error(`fixture: no «${word}»`);
  return { start: token.s, end: token.e };
};

const HT_SETTINGS: HtSettings = {
  attempts: 2,
  threshold: 70,
  penalty: 'half',
  showCount: false,
  hints: true,
  revealKey: true,
};

const htDocument = (settings: Partial<HtSettings> = {}): HighlightInTextContent => ({
  title: 'Preteritum',
  instruction: 'Les teksten og marker det oppgaven spør om.',
  text: HT_TEXT,
  questions: [
    {
      id: 'q1',
      prompt: 'Marker verbene i preteritum.',
      unit: 'word',
      spans: ['reiste', 'bodde', 'spiste'].map((w, i) => ({ id: `s${i}`, ...htAt(w), why: `${w} — why` })),
      missHint: 'Se etter verb.',
      fpHint: 'Steder er ikke verb.',
    },
    {
      id: 'q2',
      prompt: 'Marker stedet.',
      unit: 'word',
      spans: [{ id: 's9', ...htAt('Bodø'), why: '' }],
      missHint: 'Hvor reiste de?',
      fpHint: '',
    },
  ],
  orphans: [],
  settings: { ...HT_SETTINGS, ...settings },
});

const makeHtDef = (settings: Partial<HtSettings> = {}): ExerciseDefinition => {
  const doc = htDocument(settings);
  return {
    exercise: {
      id: 'ex-1',
      templateCode: 'highlight_in_text',
      targetLanguage: 'nb',
      difficultyLevel: 'B1',
      content: htToContent(doc) as unknown as Record<string, unknown>,
      expectedAnswers: htToExpectedAnswers(doc) as unknown as Record<string, unknown>,
      answerCheckSettings: null,
    },
    template: {
      code: 'highlight_in_text',
      contentSchema: {},
      answerSchema: { type: 'object' },
      defaultCheckSettings: {},
      supportedLanguages: null,
    },
    instruction: null,
  };
};

const makeHtAttempt = (checkMode: 'PRACTICE' | 'GRADED' = 'PRACTICE') =>
  Attempt.reconstitute({
    id: 'attempt-1',
    userId: 'user-1',
    exerciseId: 'ex-1',
    assignmentId: null,
    enrollmentId: null,
    templateCode: 'highlight_in_text',
    targetLanguage: 'nb',
    difficultyLevel: 'B1',
    checkMode,
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
    recheckCount: 0,
    startedAt: new Date(),
    submittedAt: null,
    scoredAt: null,
  });

/** One attempt, one publisher, as many submits as the test makes. */
const htSession = (def: ExerciseDefinition = makeHtDef(), checkMode: 'PRACTICE' | 'GRADED' = 'PRACTICE') => {
  const attempt = makeHtAttempt(checkMode);
  const repo = makeRepo(attempt);
  const publisher = makePublisher();
  const inner = new HighlightInTextValidator();
  const validator: IAnswerValidator = {
    validate: jest
      .fn<IAnswerValidator['validate']>()
      .mockImplementation(async (input) => inner.validate(input as never)),
    supports: () => true,
  } as IAnswerValidator;
  const handler = makeHandler(repo, makeContentClient(Result.ok(def)), validator, makeFeedback(), publisher);
  const submit = (answer: Record<string, unknown>) =>
    handler.execute(new SubmitAnswerCommand('attempt-1', 'user-1', answer, 10, 'nb'));
  const completed = () =>
    publisher.publish.mock.calls.filter(([type]) => type === 'exercise.attempt.completed');
  return { attempt, repo, submit, completed };
};

interface HtDetails {
  questionId: string;
  pct: number;
  passed: boolean;
  attempt: number;
  checksLeft: number | null;
  closed: boolean;
  revealed: boolean;
  miss: number;
  cells: Array<Record<string, unknown>>;
  key?: Array<Record<string, unknown>>;
  questions: Array<{ questionId: string; checks: number; firstPassed: boolean | null; closed: boolean }>;
}

describe('SubmitAnswerHandler — highlight_in_text', () => {
  it('answers one question, keeps the attempt open and publishes nothing while another is open (§8.7)', async () => {
    const s = htSession();
    const result = await s.submit({ questionId: 'q1', marks: [htAt('reiste'), htAt('bodde'), htAt('spiste')] });

    expect(result.isOk).toBe(true);
    const details = result.value.details as HtDetails;
    expect(details).toMatchObject({ questionId: 'q1', pct: 100, passed: true, closed: true });
    // The attempt: q1's first check 100, q2 not yet checked.
    expect(result.value.score).toBe(50);
    // Still the open attempt — a reload resumes it — with the record of q1 written down.
    expect(s.attempt.status).toBe('IN_PROGRESS');
    expect(s.attempt.recheckCount).toBe(0);
    expect(s.repo.save).toHaveBeenCalledWith(s.attempt);
    expect((s.attempt.validationDetails as HtDetails).questions.find((q) => q.questionId === 'q1')).toMatchObject({
      checks: 1,
      firstPassed: true,
      closed: true,
    });
    expect(s.completed()).toHaveLength(0);
  });

  it('is scored once, by the submit that closes the last question', async () => {
    const s = htSession();
    await s.submit({ questionId: 'q1', marks: [htAt('reiste'), htAt('bodde'), htAt('spiste')] });
    await s.submit({ questionId: 'q2', marks: [htAt('Bodø')] });

    expect(s.attempt.status).toBe('SCORED');
    expect(s.attempt.scoreValue).toBe(100);
    expect(s.attempt.passed).toBe(true);
    expect(s.completed()).toHaveLength(1);
  });

  it('publishes once, on the submit that closes the last question, with the first checks (AC-S12)', async () => {
    const s = htSession();
    // q1: first check finds one of three — fails; second finds all — passes.
    await s.submit({ questionId: 'q1', marks: [htAt('reiste')] });
    await s.submit({ questionId: 'q1', marks: [htAt('reiste'), htAt('bodde'), htAt('spiste')] });
    expect(s.completed()).toHaveLength(0);

    const last = await s.submit({ questionId: 'q2', marks: [htAt('Bodø')] });

    expect(last.isOk).toBe(true);
    expect(s.completed()).toHaveLength(1);
    const payload = s.completed()[0]![1] as {
      score: number;
      passed: boolean;
      gapResults?: Array<{ gapKey: string; correct: boolean }>;
    };
    // Mean of the first checks: q1 1/3 → 33%, q2 100% → 67%; a later pass does not raise it.
    expect(payload.score).toBe(67);
    expect(payload.passed).toBe(false);
    expect(payload.gapResults?.map(({ gapKey, correct }) => ({ gapKey, correct }))).toEqual([
      { gapKey: 'q1', correct: false },
      { gapKey: 'q2', correct: true },
    ]);
  });

  it('counts the checks itself — a forged state from the client changes nothing', async () => {
    const s = htSession();
    await s.submit({ questionId: 'q1', marks: [htAt('Kari')] });

    const forged = [{ questionId: 'q1', checks: 0, firstScore: 1, firstPassed: true, passed: false, revealed: false, closed: false }];
    const second = await s.submit({ questionId: 'q1', marks: [htAt('Kari')], questions: forged });

    const details = second.value.details as HtDetails;
    expect(details).toMatchObject({ attempt: 2, checksLeft: 0, closed: true });
    expect(details.questions.find((q) => q.questionId === 'q1')).toMatchObject({ checks: 2, firstPassed: false });
  });

  it('refuses a question past its budget as a closed attempt state, and saves nothing (AC-S7)', async () => {
    const s = htSession();
    await s.submit({ questionId: 'q1', marks: [htAt('Kari')] });
    await s.submit({ questionId: 'q1', marks: [htAt('Kari')] });
    s.repo.save.mockClear();

    const third = await s.submit({ questionId: 'q1', marks: [htAt('reiste')] });

    expect(third.isFail).toBe(true);
    expect(third.error).toBeInstanceOf(InvalidAttemptTransitionError);
    expect(s.repo.save).not.toHaveBeenCalled();
  });

  it('a reveal returns the key, closes the question, and refuses every submit after it (AC-S9)', async () => {
    const s = htSession();
    await s.submit({ questionId: 'q1', marks: [htAt('Kari')] });

    const reveal = await s.submit({ questionId: 'q1', reveal: true });
    const details = reveal.value.details as HtDetails;
    expect(details).toMatchObject({ revealed: true, closed: true });
    expect(details.key?.map((k) => k['why'])).toEqual(['reiste — why', 'bodde — why', 'spiste — why']);
    // Nothing was checked, so the line must not call the question wrong and ask for a retry.
    expect(reveal.value.feedback.summary).toBe('The answer has been shown.');

    const after = await s.submit({ questionId: 'q1', marks: [htAt('reiste'), htAt('bodde'), htAt('spiste')] });
    expect(after.error).toBeInstanceOf(InvalidAttemptTransitionError);
  });

  it('keeps the generator\'s line for a check that is not a reveal', async () => {
    const s = htSession();
    const check = await s.submit({ questionId: 'q1', marks: [htAt('Kari')] });

    expect(check.value.feedback.summary).not.toBe('The answer has been shown.');
  });

  it('still allows the key on a question out of checks, and does not publish twice', async () => {
    const s = htSession(makeHtDef({ attempts: 1 }));
    await s.submit({ questionId: 'q1', marks: [htAt('Kari')] });
    await s.submit({ questionId: 'q2', marks: [htAt('Kari')] });
    expect(s.completed()).toHaveLength(1);

    const reveal = await s.submit({ questionId: 'q1', reveal: true });

    expect(reveal.isOk).toBe(true);
    expect(s.completed()).toHaveLength(1);
  });

  it('writes a failed attempt and publishes it as failed, as plan 66 AC-X3 asks of sort', async () => {
    const s = htSession(makeHtDef({ attempts: 1 }));
    await s.submit({ questionId: 'q1', marks: [htAt('Kari')] });
    await s.submit({ questionId: 'q2', marks: [htAt('Kari')] });

    expect(s.attempt.status).toBe('SCORED');
    expect(s.attempt.scoreValue).toBe(0);
    expect(s.attempt.passed).toBe(false);
    const payload = s.completed()[0]![1] as { passed: boolean; score: number };
    expect(payload).toMatchObject({ passed: false, score: 0 });
  });

  it('withholds where the missed marks are on a failed check (AC-S5)', async () => {
    const s = htSession();
    const result = await s.submit({ questionId: 'q1', marks: [htAt('reiste')] });

    const details = result.value.details as HtDetails;
    expect(details).toMatchObject({ miss: 2 });
    expect(details).not.toHaveProperty('key');
    const json = JSON.stringify(details);
    for (const missed of ['bodde', 'spiste']) {
      expect(json).not.toContain(`"start":${htAt(missed).start}`);
      expect(json).not.toContain(`${missed} — why`);
    }
  });

  it('refuses a mark over no word as a validation error, not a state', async () => {
    const s = htSession();
    const dot = HT_TEXT.indexOf('.');
    const result = await s.submit({ questionId: 'q1', marks: [{ start: dot, end: dot + 1 }] });

    expect(result.isFail).toBe(true);
    expect(result.error).toBeInstanceOf(ValidationError);
    expect((result.error as ValidationError).code).toBe('HT_MARK_UNSNAPPABLE');
  });
});

describe('SubmitAnswerHandler — highlight_in_text lowers its evidence (plan 67 §3.6)', () => {
  const finish = async (settings: Partial<HtSettings>) => {
    const s = htSession(makeHtDef(settings));
    await s.submit({ questionId: 'q1', marks: [htAt('reiste'), htAt('bodde'), htAt('spiste')] });
    await s.submit({ questionId: 'q2', marks: [htAt('Bodø')] });
    return s.completed()[0]![1] as { evidenceLowered?: boolean };
  };

  it('says nothing on an ordinary exercise', async () => {
    expect(await finish({})).not.toHaveProperty('evidenceLowered');
  });

  it('lowers it while the count is shown (AC-G3’s twin)', async () => {
    expect((await finish({ showCount: true })).evidenceLowered).toBe(true);
  });

  it('lowers it with no penalty for an extra mark (AC-G3)', async () => {
    expect((await finish({ penalty: 'off' })).evidenceLowered).toBe(true);
  });
});

describe('SubmitAnswerHandler — highlight_in_text in a graded attempt (Q8-A)', () => {
  const gradedSession = (settings: Partial<HtSettings> = {}) => htSession(makeHtDef(settings), 'GRADED');

  it('answers every question, one check each, and scores on the last', async () => {
    const s = gradedSession({ attempts: 3 });
    const q1 = await s.submit({ questionId: 'q1', marks: [htAt('reiste')] });
    expect(q1.isOk).toBe(true);
    expect(q1.value.details as HtDetails).toMatchObject({ closed: true, checksLeft: 0 });
    expect(q1.value.details).not.toHaveProperty('missHint');
    expect(s.attempt.status).toBe('IN_PROGRESS');

    const q2 = await s.submit({ questionId: 'q2', marks: [htAt('Bodø')] });
    expect(q2.isOk).toBe(true);
    expect(s.attempt.status).toBe('SCORED');
    expect(s.completed()).toHaveLength(1);
  });

  it('refuses a second check of a question whatever `settings.attempts` says', async () => {
    const s = gradedSession({ attempts: 3 });
    await s.submit({ questionId: 'q1', marks: [htAt('reiste')] });

    const again = await s.submit({ questionId: 'q1', marks: [htAt('reiste'), htAt('bodde'), htAt('spiste')] });

    expect(again.error).toBeInstanceOf(InvalidAttemptTransitionError);
  });

  it('never reveals the key, even if the client says it is practising', async () => {
    const s = gradedSession();
    await s.submit({ questionId: 'q1', marks: [htAt('reiste')], graded: false });

    const reveal = await s.submit({ questionId: 'q1', reveal: true, graded: false });

    expect(reveal.error).toBeInstanceOf(InvalidAttemptTransitionError);
  });
});
