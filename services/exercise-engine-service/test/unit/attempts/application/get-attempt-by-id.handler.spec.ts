import { jest } from '@jest/globals';
import { GetAttemptByIdHandler } from '../../../../src/modules/attempts/application/queries/get-attempt-by-id/get-attempt-by-id.handler.js';
import { GetAttemptByIdQuery } from '../../../../src/modules/attempts/application/queries/get-attempt-by-id/get-attempt-by-id.query.js';
import { Attempt } from '../../../../src/modules/attempts/domain/entities/attempt.entity.js';

const makeAttempt = (userId = 'user-1') =>
  Attempt.reconstitute({
    id: 'attempt-1',
    userId,
    exerciseId: 'ex-1',
    assignmentId: null,
    enrollmentId: null,
    templateCode: 'multiple_choice',
    targetLanguage: 'no',
    difficultyLevel: 'A1',
    status: 'SCORED',
    score: 100,
    passed: true,
    timeSpentSeconds: 30,
    submittedAnswer: null,
    validationDetails: null,
    feedback: null,
    answerHash: null,
    revisionCount: 0,
    startedAt: new Date('2026-01-01T10:00:00Z'),
    submittedAt: null,
    scoredAt: null,
  });

const makeRepo = () => ({
  findById: jest.fn<() => Promise<Attempt | null>>(),
});

const makeHandler = (repo: ReturnType<typeof makeRepo>) =>
  new GetAttemptByIdHandler(repo as any);

describe('GetAttemptByIdHandler', () => {
  it('returns the attempt when it belongs to the requesting user', async () => {
    const repo = makeRepo();
    repo.findById.mockResolvedValue(makeAttempt('user-1'));
    const handler = makeHandler(repo);

    const result = await handler.execute(new GetAttemptByIdQuery('attempt-1', 'user-1'));

    expect(result.isOk).toBe(true);
    expect(result.value.id).toBe('attempt-1');
    expect(repo.findById).toHaveBeenCalledWith('attempt-1');
  });

  it('returns ATTEMPT_NOT_FOUND when attempt does not exist', async () => {
    const repo = makeRepo();
    repo.findById.mockResolvedValue(null);
    const handler = makeHandler(repo);

    const result = await handler.execute(new GetAttemptByIdQuery('missing', 'user-1'));

    expect(result.isFail).toBe(true);
    expect(result.error.code).toBe('ATTEMPT_NOT_FOUND');
  });

  it('returns FORBIDDEN when attempt belongs to a different user', async () => {
    const repo = makeRepo();
    repo.findById.mockResolvedValue(makeAttempt('other-user'));
    const handler = makeHandler(repo);

    const result = await handler.execute(new GetAttemptByIdQuery('attempt-1', 'user-1'));

    expect(result.isFail).toBe(true);
    expect(result.error.code).toBe('FORBIDDEN');
  });
});
