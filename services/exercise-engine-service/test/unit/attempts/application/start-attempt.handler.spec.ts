import { jest } from '@jest/globals';
import { ReviewContextResolver } from '../../../../src/modules/attempts/application/services/review-context-resolver.js';
import { StartAttemptHandler } from '../../../../src/modules/attempts/application/commands/start-attempt/start-attempt.handler.js';
import { StartAttemptCommand } from '../../../../src/modules/attempts/application/commands/start-attempt/start-attempt.command.js';
import type { IAttemptRepository } from '../../../../src/modules/attempts/domain/repositories/attempt.repository.js';
import type {
  ExercisePlacement,
  IContentClient,
  ExerciseDefinition,
} from '../../../../src/shared/application/ports/content-client.port.js';
import { ContentClientError } from '../../../../src/shared/application/ports/content-client.port.js';
import type { IOrganizationClient } from '../../../../src/shared/application/ports/organization-client.port.js';
import { OrganizationClientError } from '../../../../src/shared/application/ports/organization-client.port.js';
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

const makePlacement = (overrides: Partial<ExercisePlacement> = {}): ExercisePlacement => ({
  containerId: 'course-1',
  containerTitle: 'Ny i Norge A2',
  moduleId: 'module-1',
  moduleTitle: 'Leksjon 7',
  exerciseTitle: 'Perfektum',
  ownerSchoolId: 'school-1',
  ...overrides,
});

const returnedAttempt = (revisionCount: number) =>
  Attempt.reconstitute({
    id: 'attempt-prev',
    userId: 'user-1',
    exerciseId: 'ex-1',
    assignmentId: null,
    enrollmentId: null,
    templateCode: 'multiple_choice',
    targetLanguage: 'no',
    difficultyLevel: 'A1',
    checkMode: 'PRACTICE',
    practicedAtoms: [],
    status: 'RETURNED',
    score: null,
    passed: null,
    timeSpentSeconds: 0,
    submittedAnswer: null,
    validationDetails: null,
    feedback: null,
    answerHash: null,
    revisionCount,
    answersRevealed: false,
    selfChecksUsed: 0,
    startedAt: new Date(),
    submittedAt: new Date(),
    scoredAt: null,
    reviewedByUserId: 'teacher-1',
    reviewedAt: new Date(),
    reviewComment: 'Try again',
    reviewDecisions: null,
    schoolId: null,
    containerId: null,
    groupId: null,
    exercisePath: null,
    reviewClaimedBy: null,
    reviewClaimedAt: null,
    previousAttemptId: null,
    autoPassedItems: null,
    totalItems: null,
  });

const makeRepo = (): jest.Mocked<IAttemptRepository> => ({
  findById: jest.fn<IAttemptRepository['findById']>(),
  findInProgress: jest.fn<IAttemptRepository['findInProgress']>().mockResolvedValue(null),
  findLatestReturned: jest
    .fn<IAttemptRepository['findLatestReturned']>()
    .mockResolvedValue(null),
  findAllInProgressByExercise: jest.fn<IAttemptRepository['findAllInProgressByExercise']>(),
  findAllByUser: jest.fn<IAttemptRepository['findAllByUser']>(),
  save: jest.fn<IAttemptRepository['save']>().mockResolvedValue(undefined),
  saveAll: jest.fn<IAttemptRepository['saveAll']>().mockResolvedValue(undefined),
});

const makeContentClient = (): jest.Mocked<IContentClient> => ({
  getExerciseForAttempt: jest.fn<IContentClient['getExerciseForAttempt']>(),
  getPracticedAtoms: jest
    .fn<IContentClient['getPracticedAtoms']>()
    .mockResolvedValue(Result.ok([])),
  getExercisePlacement: jest
    .fn<IContentClient['getExercisePlacement']>()
    .mockResolvedValue(Result.ok(makePlacement())),
});

const makeOrganizationClient = (): jest.Mocked<IOrganizationClient> => ({
  getMemberRole: jest.fn<IOrganizationClient['getMemberRole']>(),
  resolveStudentGroup: jest
    .fn<IOrganizationClient['resolveStudentGroup']>()
    .mockResolvedValue(Result.ok({ groupId: 'group-1', groupName: 'A2 Kveld' })),
});

const makePublisher = (): jest.Mocked<IEventPublisher> => ({
  publish: jest.fn<IEventPublisher['publish']>().mockResolvedValue(undefined),
});

const makeHandler = (
  repo: IAttemptRepository,
  contentClient: IContentClient,
  organizationClient: IOrganizationClient,
  publisher: IEventPublisher,
) =>
  new StartAttemptHandler(
    repo as any,
    contentClient as any,
    new ReviewContextResolver(contentClient as any, organizationClient as any),
    publisher as any,
  );

const cmd = new StartAttemptCommand('user-1', 'ex-1', 'no', null, null, 'PRACTICE');

/** An open attempt, optionally holding questions already handed in. */
const inProgress = (
  answeredQuestions: Array<{ questionId: string; text: string; verdict: 'pass' | 'partial' | 'fail'; answeredAt: Date }> = [],
  templateCode = 'short_answer',
) =>
  Attempt.reconstitute({
    id: 'attempt-open',
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
    answersRevealed: false,
    selfChecksUsed: 0,
    startedAt: new Date(),
    submittedAt: null,
    scoredAt: null,
    reviewedByUserId: null,
    reviewedAt: null,
    reviewComment: null,
    reviewDecisions: null,
    schoolId: null,
    containerId: null,
    groupId: null,
    exercisePath: null,
    reviewClaimedBy: null,
    reviewClaimedAt: null,
    previousAttemptId: null,
    autoPassedItems: null,
    totalItems: null,
    answeredQuestions,
  } as any);

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
      answersRevealed: false,
      selfChecksUsed: 0,
      startedAt: new Date(),
      submittedAt: null,
      scoredAt: null,
      reviewedByUserId: null,
      reviewedAt: null,
      reviewComment: null,
      reviewDecisions: null,
      schoolId: null,
      containerId: null,
      groupId: null,
      exercisePath: null,
      reviewClaimedBy: null,
      reviewClaimedAt: null,
      previousAttemptId: null,
      autoPassedItems: null,
      totalItems: null,
    });
    repo.findInProgress.mockResolvedValue(existing);

    const handler = makeHandler(repo, makeContentClient(), makeOrganizationClient(), makePublisher());
    const result = await handler.execute(cmd);

    expect(result.isFail).toBe(true);
    const err = result.error as { code: string; attemptId: string };
    expect(err.code).toBe('ALREADY_IN_PROGRESS');
    expect(err.attemptId).toBe('attempt-existing');
  });

  // Plan 51 §8 Q6: a `short_answer` answer is final, so the attempt holding it is
  // resumed rather than reported as a conflict the caller resolves by abandoning it.
  it('resumes an open attempt that already holds answers, with what was answered', async () => {
    const repo = makeRepo();
    repo.findInProgress.mockResolvedValue(
      inProgress([
        { questionId: 'q1', text: 'I tre år.', verdict: 'pass', answeredAt: new Date() },
        { questionId: 'q2', text: 'Vet ikke.', verdict: 'fail', answeredAt: new Date() },
      ]),
    );

    const contentClient = makeContentClient();
    contentClient.getExerciseForAttempt.mockResolvedValue(
      Result.ok(
        makeExerciseDef({
          templateCode: 'short_answer',
          content: { instruction: '', questions: [{ id: 'q1', kind: 'reading', passage: '', prompt: 'Hvor lenge?' }] },
          expectedAnswers: { questions: {} },
        }),
      ),
    );

    const handler = makeHandler(repo, contentClient, makeOrganizationClient(), makePublisher());
    const result = await handler.execute(cmd);

    expect(result.isOk).toBe(true);
    expect(result.value.attemptId).toBe('attempt-open');
    expect(result.value.answeredQuestions).toEqual([
      { questionId: 'q1', text: 'I tre år.', verdict: 'pass' },
      { questionId: 'q2', text: 'Vet ikke.', verdict: 'fail' },
    ]);
    // Resumed, not restarted: no second row, and no second `attempt.started` event.
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('still reports a conflict for an open attempt holding nothing', async () => {
    const repo = makeRepo();
    repo.findInProgress.mockResolvedValue(inProgress([], 'multiple_choice'));

    const handler = makeHandler(repo, makeContentClient(), makeOrganizationClient(), makePublisher());
    const result = await handler.execute(cmd);

    expect(result.isFail).toBe(true);
    expect((result.error as { code: string }).code).toBe('ALREADY_IN_PROGRESS');
  });

  it('returns ContentClientError when exercise is not found', async () => {
    const repo = makeRepo();

    const contentClient = makeContentClient();
    contentClient.getExerciseForAttempt.mockResolvedValue(
      Result.fail(new ContentClientError(404, 'Not found')),
    );

    const handler = makeHandler(repo, contentClient, makeOrganizationClient(), makePublisher());
    const result = await handler.execute(cmd);

    expect(result.isFail).toBe(true);
    expect(result.error).toBeInstanceOf(ContentClientError);
    expect((result.error as ContentClientError).statusCode).toBe(404);
  });

  it('creates and saves an attempt on success, publishes AttemptStartedEvent', async () => {
    const repo = makeRepo();

    const contentClient = makeContentClient();
    contentClient.getExerciseForAttempt.mockResolvedValue(Result.ok(makeExerciseDef()));

    const publisher = makePublisher();
    const handler = makeHandler(repo, contentClient, makeOrganizationClient(), publisher);
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

    const handler = makeHandler(repo, contentClient, makeOrganizationClient(), makePublisher());
    const result = await handler.execute(cmd);

    expect(result.isOk).toBe(true);
    expect(result.value.checkSettings).toMatchObject({
      allow_partial_credit: true,
      passingThreshold: 80,
    });
  });

  describe('review context snapshot (plan 44 §44.4)', () => {
    it('stamps school, course, group and exercise path onto the saved attempt', async () => {
      const repo = makeRepo();
      const contentClient = makeContentClient();
      contentClient.getExerciseForAttempt.mockResolvedValue(Result.ok(makeExerciseDef()));
      contentClient.getExercisePlacement.mockResolvedValue(Result.ok(makePlacement()));

      const organizationClient = makeOrganizationClient();
      organizationClient.resolveStudentGroup.mockResolvedValue(
        Result.ok({ groupId: 'group-1', groupName: 'A2 Kveld' }),
      );

      const handler = makeHandler(repo, contentClient, organizationClient, makePublisher());
      await handler.execute(cmd);

      expect(organizationClient.resolveStudentGroup).toHaveBeenCalledWith('school-1', 'user-1');
      const saved = repo.save.mock.calls[0]![0];
      expect(saved.schoolId).toBe('school-1');
      expect(saved.containerId).toBe('course-1');
      expect(saved.groupId).toBe('group-1');
      expect(saved.exercisePath).toEqual({
        course: 'Ny i Norge A2',
        module: 'Leksjon 7',
        exercise: 'Perfektum',
      });
    });

    it('starts the attempt with null context when the placement lookup fails', async () => {
      const repo = makeRepo();
      const contentClient = makeContentClient();
      contentClient.getExerciseForAttempt.mockResolvedValue(Result.ok(makeExerciseDef()));
      contentClient.getExercisePlacement.mockResolvedValue(
        Result.fail(new ContentClientError(404, 'Not placed')),
      );

      const organizationClient = makeOrganizationClient();
      const handler = makeHandler(repo, contentClient, organizationClient, makePublisher());
      const result = await handler.execute(cmd);

      expect(result.isOk).toBe(true);
      expect(organizationClient.resolveStudentGroup).not.toHaveBeenCalled();
      const saved = repo.save.mock.calls[0]![0];
      expect(saved.schoolId).toBeNull();
      expect(saved.containerId).toBeNull();
      expect(saved.groupId).toBeNull();
      expect(saved.exercisePath).toBeNull();
    });

    it('starts the attempt with a null group when group resolution fails', async () => {
      const repo = makeRepo();
      const contentClient = makeContentClient();
      contentClient.getExerciseForAttempt.mockResolvedValue(Result.ok(makeExerciseDef()));

      const organizationClient = makeOrganizationClient();
      organizationClient.resolveStudentGroup.mockResolvedValue(
        Result.fail(new OrganizationClientError(500, 'unreachable')),
      );

      const handler = makeHandler(repo, contentClient, organizationClient, makePublisher());
      const result = await handler.execute(cmd);

      expect(result.isOk).toBe(true);
      const saved = repo.save.mock.calls[0]![0];
      expect(saved.schoolId).toBe('school-1');
      expect(saved.groupId).toBeNull();
    });

    it('leaves the group null when the placement has no owning school', async () => {
      const repo = makeRepo();
      const contentClient = makeContentClient();
      contentClient.getExerciseForAttempt.mockResolvedValue(Result.ok(makeExerciseDef()));
      contentClient.getExercisePlacement.mockResolvedValue(
        Result.ok(makePlacement({ ownerSchoolId: null })),
      );

      const organizationClient = makeOrganizationClient();
      const handler = makeHandler(repo, contentClient, organizationClient, makePublisher());
      await handler.execute(cmd);

      expect(organizationClient.resolveStudentGroup).not.toHaveBeenCalled();
      const saved = repo.save.mock.calls[0]![0];
      expect(saved.schoolId).toBeNull();
      expect(saved.groupId).toBeNull();
    });

    it('numbers the attempt 2 and links it to the previous one after a RETURNED verdict', async () => {
      const repo = makeRepo();
      repo.findLatestReturned.mockResolvedValue(returnedAttempt(0));

      const contentClient = makeContentClient();
      contentClient.getExerciseForAttempt.mockResolvedValue(Result.ok(makeExerciseDef()));

      const handler = makeHandler(repo, contentClient, makeOrganizationClient(), makePublisher());
      await handler.execute(cmd);

      const saved = repo.save.mock.calls[0]![0];
      expect(saved.previousAttemptId).toBe('attempt-prev');
      // attemptNo (DATA_MODEL.md §1) = revisionCount + 1 → this is the 2nd try.
      expect(saved.revisionCount).toBe(1);
    });

    it('starts a first attempt with revisionCount 0 and no previousAttemptId', async () => {
      const repo = makeRepo();
      const contentClient = makeContentClient();
      contentClient.getExerciseForAttempt.mockResolvedValue(Result.ok(makeExerciseDef()));

      const handler = makeHandler(repo, contentClient, makeOrganizationClient(), makePublisher());
      await handler.execute(cmd);

      const saved = repo.save.mock.calls[0]![0];
      expect(saved.previousAttemptId).toBeNull();
      expect(saved.revisionCount).toBe(0);
    });
  });
});
