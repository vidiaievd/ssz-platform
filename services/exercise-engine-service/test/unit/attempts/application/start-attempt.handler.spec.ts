import { jest } from '@jest/globals';
import { StartAttemptHandler } from '../../../../src/modules/attempts/application/commands/start-attempt/start-attempt.handler.js';
import { StartAttemptCommand } from '../../../../src/modules/attempts/application/commands/start-attempt/start-attempt.command.js';
import type { IAttemptRepository } from '../../../../src/modules/attempts/domain/repositories/attempt.repository.js';
import type { IContentClient, ExerciseDefinition } from '../../../../src/shared/application/ports/content-client.port.js';
import { ContentClientError } from '../../../../src/shared/application/ports/content-client.port.js';
import type { IEventPublisher } from '../../../../src/shared/application/ports/event-publisher.port.js';
import { Result } from '../../../../src/shared/kernel/result.js';
import { Attempt } from '../../../../src/modules/attempts/domain/entities/attempt.entity.js';

const makeExerciseDef = (overrides: Partial<ExerciseDefinition['exercise']> = {}): ExerciseDefinition => ({
  exercise: {
    id: 'ex-1',
    templateCode: 'multiple_choice',
    targetLanguage: 'no',
    difficultyLevel: 'A1',
    content: {},
    expectedAnswers: { correct_option_ids: ['A'] },
    answerCheckSettings: null,
    ...overrides,
  },
  template: {
    code: 'multiple_choice',
    contentSchema: {},
    answerSchema: {},
    defaultCheckSettings: {},
    supportedLanguages: null,
  },
  instruction: null,
});

const makeRepo = (): jest.Mocked<IAttemptRepository> => ({
  findById: jest.fn<IAttemptRepository['findById']>(),
  findInProgress: jest.fn<IAttemptRepository['findInProgress']>(),
  findAllByUser: jest.fn<IAttemptRepository['findAllByUser']>(),
  save: jest.fn<IAttemptRepository['save']>().mockResolvedValue(undefined),
});

const makeContentClient = (): jest.Mocked<IContentClient> => ({
  getExerciseForAttempt: jest.fn<IContentClient['getExerciseForAttempt']>(),
});

const makePublisher = (): jest.Mocked<IEventPublisher> => ({
  publish: jest.fn<IEventPublisher['publish']>().mockResolvedValue(undefined),
});

const makeHandler = (
  repo: IAttemptRepository,
  contentClient: IContentClient,
  publisher: IEventPublisher,
) => new StartAttemptHandler(repo as any, contentClient as any, publisher as any);

const cmd = new StartAttemptCommand('user-1', 'ex-1', 'no', null, null);

describe('StartAttemptHandler', () => {
  it('returns ALREADY_IN_PROGRESS when an in-progress attempt exists', async () => {
    const repo = makeRepo();
    const existing = Attempt.reconstitute({
      id: 'attempt-existing',
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
    repo.findInProgress.mockResolvedValue(existing);

    const handler = makeHandler(repo, makeContentClient(), makePublisher());
    const result = await handler.execute(cmd);

    expect(result.isFail).toBe(true);
    const err = result.error as { code: string; attemptId: string };
    expect(err.code).toBe('ALREADY_IN_PROGRESS');
    expect(err.attemptId).toBe('attempt-existing');
  });

  it('returns ContentClientError when exercise is not found', async () => {
    const repo = makeRepo();
    repo.findInProgress.mockResolvedValue(null);

    const contentClient = makeContentClient();
    contentClient.getExerciseForAttempt.mockResolvedValue(
      Result.fail(new ContentClientError(404, 'Not found')),
    );

    const handler = makeHandler(repo, contentClient, makePublisher());
    const result = await handler.execute(cmd);

    expect(result.isFail).toBe(true);
    expect(result.error).toBeInstanceOf(ContentClientError);
    expect((result.error as ContentClientError).statusCode).toBe(404);
  });

  it('creates and saves an attempt on success, publishes AttemptStartedEvent', async () => {
    const repo = makeRepo();
    repo.findInProgress.mockResolvedValue(null);

    const contentClient = makeContentClient();
    contentClient.getExerciseForAttempt.mockResolvedValue(Result.ok(makeExerciseDef()));

    const publisher = makePublisher();
    const handler = makeHandler(repo, contentClient, publisher);
    const result = await handler.execute(cmd);

    expect(result.isOk).toBe(true);
    expect(result.value.templateCode).toBe('multiple_choice');
    expect(result.value.targetLanguage).toBe('no');
    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(publisher.publish).toHaveBeenCalledWith(
      'exercise.attempt.started',
      expect.objectContaining({ userId: 'user-1', exerciseId: 'ex-1' }),
    );
  });

  it('merges template defaultCheckSettings with exercise answerCheckSettings', async () => {
    const repo = makeRepo();
    repo.findInProgress.mockResolvedValue(null);

    const contentClient = makeContentClient();
    contentClient.getExerciseForAttempt.mockResolvedValue(
      Result.ok({
        ...makeExerciseDef({ answerCheckSettings: { passingThreshold: 80 } }),
        template: {
          code: 'multiple_choice',
          contentSchema: {},
          answerSchema: {},
          defaultCheckSettings: { allow_partial_credit: true },
          supportedLanguages: null,
        },
        instruction: null,
      }),
    );

    const handler = makeHandler(repo, contentClient, makePublisher());
    const result = await handler.execute(cmd);

    expect(result.isOk).toBe(true);
    expect(result.value.checkSettings).toMatchObject({
      allow_partial_credit: true,
      passingThreshold: 80,
    });
  });
});
