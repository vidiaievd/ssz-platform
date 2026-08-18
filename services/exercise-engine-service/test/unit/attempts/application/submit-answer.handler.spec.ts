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
});
