import { jest } from '@jest/globals';
import { of, throwError } from 'rxjs';
import { AxiosError } from 'axios';
import { HttpLearningClient } from '../../../../src/infrastructure/http/http-learning-client.js';
import { LearningClientError } from '../../../../src/shared/application/ports/learning-client.port.js';

const makeAxiosError = (status: number, message: string): AxiosError => {
  const err = new AxiosError(message);
  err.response = {
    status,
    data: { message },
    statusText: String(status),
    headers: {},
    config: {} as any,
  };
  return err;
};

const mockHttpService = { post: jest.fn() };

const mockConfig = {
  get: jest.fn().mockImplementation((key: string) => {
    const map: Record<string, unknown> = {
      learning: { baseUrl: 'http://learning:3007', timeoutMs: 3000, retries: 1 },
      internalServiceToken: 'test-token',
    };
    return map[key];
  }),
};

const makeClient = () =>
  new HttpLearningClient(mockHttpService as any, mockConfig as any);

const stubInput = {
  assignmentId: 'assign-1',
  exerciseId: 'ex-1',
  userId: 'user-1',
  attemptId: 'attempt-1',
  submittedAnswer: { selected: 'A' },
  timeSpentSeconds: 30,
};

describe('HttpLearningClient', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns Result.ok with submissionId on success', async () => {
    mockHttpService.post.mockReturnValue(of({ data: { submissionId: 'sub-1' } }));
    const client = makeClient();

    const result = await client.createSubmission(stubInput);

    expect(result.isOk).toBe(true);
    expect(result.value).toEqual({ submissionId: 'sub-1' });
    expect(mockHttpService.post).toHaveBeenCalledWith(
      'http://learning:3007/api/v1/submissions',
      expect.objectContaining({
        exerciseId: 'ex-1',
        userId: 'user-1',
        attemptId: 'attempt-1',
      }),
      expect.objectContaining({
        headers: { 'x-internal-token': 'test-token' },
      }),
    );
  });

  it('returns Result.fail on 422 validation error', async () => {
    mockHttpService.post.mockReturnValue(
      throwError(() => makeAxiosError(422, 'Validation failed')),
    );
    const client = makeClient();

    const result = await client.createSubmission(stubInput);

    expect(result.isFail).toBe(true);
    expect(result.error).toBeInstanceOf(LearningClientError);
    expect((result.error as LearningClientError).statusCode).toBe(422);
  });

  it('returns Result.fail on 503 service unavailable', async () => {
    mockHttpService.post.mockReturnValue(
      throwError(() => makeAxiosError(503, 'Service Unavailable')),
    );
    const client = makeClient();

    const result = await client.createSubmission(stubInput);

    expect(result.isFail).toBe(true);
    expect((result.error as LearningClientError).statusCode).toBe(503);
  });

  it('returns Result.fail with status 500 on network error', async () => {
    const networkErr = new AxiosError('Network Error');
    mockHttpService.post.mockReturnValue(throwError(() => networkErr));
    const client = makeClient();

    const result = await client.createSubmission(stubInput);

    expect(result.isFail).toBe(true);
    expect((result.error as LearningClientError).statusCode).toBe(500);
  });
});
