import { jest } from '@jest/globals';
import { of, throwError } from 'rxjs';
import { AxiosError } from 'axios';
import { HttpContentClient } from '../../../../src/infrastructure/http/http-content-client.js';
import { ContentClientError } from '../../../../src/shared/application/ports/content-client.port.js';

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

const mockHttpService = { get: jest.fn() };

const mockConfig = {
  get: jest.fn().mockImplementation((key: string) => {
    const map: Record<string, unknown> = {
      content: { baseUrl: 'http://content:3003', timeoutMs: 2000, retries: 2 },
      internalServiceToken: 'test-token',
    };
    return map[key];
  }),
};

const makeClient = () =>
  new HttpContentClient(mockHttpService as any, mockConfig as any);

const stubDefinition = {
  exercise: {
    id: 'ex-1',
    templateCode: 'multiple_choice',
    targetLanguage: 'no',
    difficultyLevel: 'B1',
    content: {},
    expectedAnswers: {},
    answerCheckSettings: null,
  },
  template: {
    code: 'multiple_choice',
    contentSchema: {},
    answerSchema: {},
    defaultCheckSettings: {},
    supportedLanguages: null,
  },
  instruction: null,
};

describe('HttpContentClient', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns Result.ok with exercise definition on success', async () => {
    mockHttpService.get.mockReturnValue(of({ data: stubDefinition }));
    const client = makeClient();

    const result = await client.getExerciseForAttempt('ex-1', 'no');

    expect(result.isOk).toBe(true);
    expect(result.value).toEqual(stubDefinition);
    expect(mockHttpService.get).toHaveBeenCalledWith(
      'http://content:3003/api/v1/internal/exercises/ex-1',
      expect.objectContaining({
        params: { language: 'no' },
        headers: { 'x-internal-token': 'test-token' },
      }),
    );
  });

  it('returns Result.fail with status 404 when exercise not found', async () => {
    mockHttpService.get.mockReturnValue(throwError(() => makeAxiosError(404, 'Not found')));
    const client = makeClient();

    const result = await client.getExerciseForAttempt('missing', 'no');

    expect(result.isFail).toBe(true);
    expect(result.error).toBeInstanceOf(ContentClientError);
    expect((result.error as ContentClientError).statusCode).toBe(404);
  });

  it('returns Result.fail with status 500 on server error', async () => {
    mockHttpService.get.mockReturnValue(throwError(() => makeAxiosError(500, 'Internal error')));
    const client = makeClient();

    const result = await client.getExerciseForAttempt('ex-1', 'no');

    expect(result.isFail).toBe(true);
    expect((result.error as ContentClientError).statusCode).toBe(500);
  });

  it('returns Result.fail with status 500 on network error (no response)', async () => {
    const networkErr = new AxiosError('Network Error');
    mockHttpService.get.mockReturnValue(throwError(() => networkErr));
    const client = makeClient();

    const result = await client.getExerciseForAttempt('ex-1', 'no');

    expect(result.isFail).toBe(true);
    expect((result.error as ContentClientError).statusCode).toBe(500);
  });

  it('returns Result.fail with status 500 on unexpected non-axios error', async () => {
    mockHttpService.get.mockReturnValue(throwError(() => new Error('unexpected')));
    const client = makeClient();

    const result = await client.getExerciseForAttempt('ex-1', 'no');

    expect(result.isFail).toBe(true);
    expect((result.error as ContentClientError).statusCode).toBe(500);
  });
});
