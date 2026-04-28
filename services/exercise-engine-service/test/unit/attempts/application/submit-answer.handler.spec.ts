import { jest } from '@jest/globals';
import { SubmitAnswerHandler } from '../../../../src/modules/attempts/application/commands/submit-answer/submit-answer.handler.js';
import { SubmitAnswerCommand } from '../../../../src/modules/attempts/application/commands/submit-answer/submit-answer.command.js';
import type { IAttemptRepository } from '../../../../src/modules/attempts/domain/repositories/attempt.repository.js';
import type { IContentClient, ExerciseDefinition } from '../../../../src/shared/application/ports/content-client.port.js';
import { ContentClientError } from '../../../../src/shared/application/ports/content-client.port.js';
import type { IAnswerValidator } from '../../../../src/shared/application/ports/answer-validator.port.js';
import { ValidationError } from '../../../../src/shared/application/ports/answer-validator.port.js';
import type { IFeedbackGenerator } from '../../../../src/shared/application/ports/feedback-generator.port.js';
import type { ILearningClient } from '../../../../src/shared/application/ports/learning-client.port.js';
import { LearningClientError } from '../../../../src/shared/application/ports/learning-client.port.js';
import type { IEventPublisher } from '../../../../src/shared/application/ports/event-publisher.port.js';
import { Result } from '../../../../src/shared/kernel/result.js';
import { Attempt } from '../../../../src/modules/attempts/domain/entities/attempt.entity.js';

const makeInProgressAttempt = () =>
  Attempt.reconstitute({
    id: 'attempt-1',
    userId: 'user-1',
    exerciseId: 'ex-1',
    assignmentId: null,
    enrollmentId: null,
    templateCode: 'multiple_choice',
    targetLanguage: 'no',
    difficultyLevel: 'A1',
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
});

const makeValidator = (outcome = { correct: true, score: 100, details: null, requiresReview: false }): jest.Mocked<IAnswerValidator> => ({
  validate: jest.fn<IAnswerValidator['validate']>().mockResolvedValue(Result.ok(outcome)),
});

const makeFeedback = (): jest.Mocked<IFeedbackGenerator> => ({
  generate: jest.fn<IFeedbackGenerator['generate']>().mockResolvedValue(
    Result.ok({ summary: 'Correct!' }),
  ),
});

const makeLearning = (): jest.Mocked<ILearningClient> => ({
  createSubmission: jest.fn<ILearningClient['createSubmission']>().mockResolvedValue(
    Result.ok({ submissionId: 'sub-1' }),
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
  learning: ILearningClient,
  publisher: IEventPublisher,
) => new SubmitAnswerHandler(
  repo as any, content as any, validator as any,
  feedback as any, learning as any, publisher as any,
);

const cmd = new SubmitAnswerCommand('attempt-1', 'user-1', { correct_option_ids: ['A'] }, 30, 'no');

describe('SubmitAnswerHandler', () => {
  it('returns ATTEMPT_NOT_FOUND when attempt does not exist', async () => {
    const handler = makeHandler(
      makeRepo(null), makeContentClient(), makeValidator(),
      makeFeedback(), makeLearning(), makePublisher(),
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
      makeFeedback(), makeLearning(), makePublisher(),
    );
    const result = await handler.execute(wrongUserCmd);
    expect(result.isFail).toBe(true);
    expect((result.error as any).code).toBe('FORBIDDEN');
  });

  it('returns ContentClientError when exercise fetch fails', async () => {
    const handler = makeHandler(
      makeRepo(),
      makeContentClient(Result.fail(new ContentClientError(503, 'Service unavailable'))),
      makeValidator(), makeFeedback(), makeLearning(), makePublisher(),
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
      makeFeedback(), makeLearning(), makePublisher(),
    );
    const result = await handler.execute(cmd);
    expect(result.isFail).toBe(true);
    expect(result.error).toBeInstanceOf(ValidationError);
    expect((result.error as ValidationError).code).toBe('SCHEMA_MISMATCH');
  });

  it('closed-form: scores attempt, publishes completed event, notifies Learning', async () => {
    const repo = makeRepo();
    const publisher = makePublisher();
    const learning = makeLearning();
    const handler = makeHandler(
      repo, makeContentClient(),
      makeValidator({ correct: true, score: 100, details: null, requiresReview: false }),
      makeFeedback(), learning, publisher,
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
      makeFeedback(), makeLearning(), makePublisher(),
    );
    const result = await handler.execute(cmd);
    expect(result.isOk).toBe(true);
    expect(result.value.correct).toBe(false);
    expect(result.value.score).toBe(40);
  });

  it('free-form: routes for review, publishes completed with completed=false', async () => {
    const repo = makeRepo();
    const publisher = makePublisher();
    const handler = makeHandler(
      repo, makeContentClient(),
      makeValidator({ correct: false, score: 0, details: null, requiresReview: true }),
      makeFeedback(), makeLearning(), publisher,
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

  it('learning client failure does not fail the use case (fire-and-forget)', async () => {
    const learning = makeLearning();
    learning.createSubmission.mockResolvedValue(
      Result.fail(new LearningClientError(503, 'Down')),
    );
    const handler = makeHandler(
      makeRepo(), makeContentClient(),
      makeValidator({ correct: true, score: 100, details: null, requiresReview: false }),
      makeFeedback(), learning, makePublisher(),
    );
    const result = await handler.execute(cmd);
    expect(result.isOk).toBe(true);
  });
});
