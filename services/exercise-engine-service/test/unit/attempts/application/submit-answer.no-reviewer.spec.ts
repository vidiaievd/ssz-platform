import { jest } from '@jest/globals';
import { SubmitAnswerHandler } from '../../../../src/modules/attempts/application/commands/submit-answer/submit-answer.handler.js';
import { SubmitAnswerCommand } from '../../../../src/modules/attempts/application/commands/submit-answer/submit-answer.command.js';
import type { ReviewerResolver } from '../../../../src/modules/attempts/application/services/reviewer-resolver.js';
import type { ReviewPolicyResolver } from '../../../../src/modules/attempts/application/services/review-policy-resolver.js';
import type { IAttemptRepository } from '../../../../src/modules/attempts/domain/repositories/attempt.repository.js';
import type { IEventPublisher } from '../../../../src/shared/application/ports/event-publisher.port.js';
import { Result } from '../../../../src/shared/kernel/result.js';
import { Attempt } from '../../../../src/modules/attempts/domain/entities/attempt.entity.js';

// Plan 79, step 2.1c — free-form work nobody will read closes at submit.

const makeAttempt = (schoolId: string | null) =>
  Attempt.reconstitute({
    id: 'attempt-1',
    userId: 'user-1',
    exerciseId: 'ex-1',
    assignmentId: null,
    enrollmentId: null,
    templateCode: 'translate_to_target',
    targetLanguage: 'nb',
    difficultyLevel: 'A2',
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
    schoolId,
    containerId: 'course-1',
    groupId: schoolId === null ? null : 'group-1',
  } as never);

const AI_FIRST = {
  mode: 'ai_with_sampling' as const,
  autoAcceptAt: new Date('2026-11-01T10:00:00.000Z'),
  teacherDrawn: true,
};

const setup = (opts: {
  schoolId: string | null;
  reviewer?: 'ai' | 'none' | 'unbound';
  policy?: typeof AI_FIRST | null;
}) => {
  const attempt = makeAttempt(opts.schoolId);
  const repo = {
    findById: jest.fn<IAttemptRepository['findById']>().mockResolvedValue(attempt),
    save: jest.fn<IAttemptRepository['save']>().mockResolvedValue(undefined),
  };
  const content = {
    getExerciseForAttempt: jest.fn(async () =>
      Result.ok({
        exercise: { id: 'ex-1', templateCode: 'translate_to_target', content: { items: [] }, expectedAnswers: {}, answerCheckSettings: null },
        template: { code: 'translate_to_target', answerSchema: {}, defaultCheckSettings: {} },
        instruction: null,
      }),
    ),
  };
  const validator = {
    validate: jest.fn(async () =>
      Result.ok({
        correct: false,
        score: 0,
        requiresReview: true,
        details: { totalItems: 2, passedItems: 1, routedItems: 1, items: [] },
      }),
    ),
  };
  const publisher = { publish: jest.fn<IEventPublisher['publish']>().mockResolvedValue(undefined) };
  // Nobody to backfill from: the learner has no workspace.
  const reviewContext = {
    resolve: jest.fn(async () => ({ schoolId: null, containerId: null, groupId: null, exercisePath: null })),
  };
  const resolve = jest.fn<ReviewerResolver['resolve']>().mockResolvedValue(
    opts.reviewer === 'none' ? 'none' : 'ai',
  );
  const resolvePolicy = jest
    .fn<ReviewPolicyResolver['resolve']>()
    .mockResolvedValue(opts.policy ?? null);
  const handler = new SubmitAnswerHandler(
    repo as never,
    content as never,
    validator as never,
    { generate: jest.fn() } as never,
    publisher as never,
    reviewContext as never,
    undefined,
    null,
    opts.reviewer === 'unbound' ? null : ({ resolve } as never),
    { resolve: resolvePolicy } as never,
  );
  const submit = () =>
    handler.execute(new SubmitAnswerCommand('attempt-1', 'user-1', { answers: [] }, 30, 'nb'));
  const published = () => publisher.publish.mock.calls.map(([type]) => type);
  const routed = () =>
    publisher.publish.mock.calls.find(([type]) => type === 'exercise.attempt.routed_for_review')?.[1];
  return { attempt, submit, published, routed, resolve, resolvePolicy };
};

describe('SubmitAnswerHandler — who reads free-form work (plan 79, 2.1c)', () => {
  it('closes self-study work nobody can review, and says so', async () => {
    const s = setup({ schoolId: null, reviewer: 'none' });
    const result = await s.submit();

    expect(result.value).toMatchObject({ requiresReview: true, reviewer: 'none', score: null });
    expect(result.value.feedback.summary).toMatch(/nobody can check it/i);
    expect(s.attempt.status).toBe('NO_REVIEWER');
    expect(s.attempt.autoPassedItems).toBe(1);
    // Handed in for progress; nothing for a queue that no one reads.
    expect(s.published()).toEqual(['exercise.attempt.completed']);
  });

  it('routes self-study work a model may review', async () => {
    const s = setup({ schoolId: null, reviewer: 'ai' });
    const result = await s.submit();

    expect(result.value).toMatchObject({ requiresReview: true, reviewer: 'ai' });
    expect(s.attempt.status).toBe('ROUTED_FOR_REVIEW');
    expect(s.published()).toEqual(['exercise.attempt.completed', 'exercise.attempt.routed_for_review']);
    expect(s.resolve).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', schoolId: null, templateCode: 'translate_to_target' }),
    );
  });

  it('leaves a school’s work to its teacher without asking', async () => {
    const s = setup({ schoolId: 'school-1', reviewer: 'none' });
    const result = await s.submit();

    expect(result.value.reviewer).toBe('teacher');
    expect(s.attempt.status).toBe('ROUTED_FOR_REVIEW');
    expect(s.resolve).not.toHaveBeenCalled();
  });

  it('routes as before when no resolver is bound', async () => {
    const s = setup({ schoolId: null, reviewer: 'unbound' });
    await s.submit();
    expect(s.attempt.status).toBe('ROUTED_FOR_REVIEW');
  });
});

describe('SubmitAnswerHandler — the school’s review policy (plan 80, 3a)', () => {
  it('keeps the school’s terms on the work and tells ai-service a model answers first', async () => {
    const s = setup({ schoolId: 'school-1', policy: AI_FIRST });
    const result = await s.submit();

    // A teacher still owns the work.
    expect(result.value.reviewer).toBe('teacher');
    expect(s.attempt.status).toBe('ROUTED_FOR_REVIEW');
    expect(s.attempt.reviewAiPolicy).toEqual(AI_FIRST);
    expect(s.routed()).toMatchObject({ schoolId: 'school-1', reviewAiMode: 'ai_with_sampling' });
    expect(s.resolvePolicy).toHaveBeenCalledWith(
      expect.objectContaining({ schoolId: 'school-1', containerId: 'course-1', templateCode: 'translate_to_target' }),
    );
  });

  it('routes to the teacher alone when the school has no model first', async () => {
    const s = setup({ schoolId: 'school-1', policy: null });
    await s.submit();

    expect(s.attempt.reviewAiPolicy).toBeNull();
    expect(s.routed()).toMatchObject({ reviewAiMode: null });
  });

  it('does not ask for work without a school', async () => {
    const s = setup({ schoolId: null, reviewer: 'ai' });
    await s.submit();
    expect(s.resolvePolicy).not.toHaveBeenCalled();
  });
});
