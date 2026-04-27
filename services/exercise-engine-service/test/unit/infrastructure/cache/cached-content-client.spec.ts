import { jest } from '@jest/globals';
import { CachedContentClient } from '../../../../src/infrastructure/cache/cached-content-client.js';
import { ContentClientError } from '../../../../src/shared/application/ports/content-client.port.js';
import { Result } from '../../../../src/shared/kernel/result.js';
import type { ExerciseDefinition } from '../../../../src/shared/application/ports/content-client.port.js';

const stubDef: ExerciseDefinition = {
  exercise: {
    id: 'ex-1',
    templateCode: 'fill_in_blank',
    targetLanguage: 'de',
    difficultyLevel: 'A2',
    content: {},
    expectedAnswers: {},
    answerCheckSettings: null,
  },
  template: {
    code: 'fill_in_blank',
    contentSchema: {},
    answerSchema: {},
    defaultCheckSettings: {},
    supportedLanguages: null,
  },
  instruction: null,
};

const makeCache = () => ({
  get: jest.fn<() => Promise<ExerciseDefinition | null>>(),
  set: jest.fn<() => Promise<void>>(),
  invalidate: jest.fn<() => Promise<void>>(),
});

const makeHttp = () => ({
  getExerciseForAttempt:
    jest.fn<() => Promise<Result<ExerciseDefinition, ContentClientError>>>(),
});

describe('CachedContentClient', () => {
  it('returns cached value without calling HTTP client on cache hit', async () => {
    const cache = makeCache();
    const http = makeHttp();
    cache.get.mockResolvedValue(stubDef);
    const client = new CachedContentClient(cache as any, http as any);

    const result = await client.getExerciseForAttempt('ex-1', 'de');

    expect(result.isOk).toBe(true);
    expect(result.value).toEqual(stubDef);
    expect(http.getExerciseForAttempt).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('calls HTTP client and populates cache on cache miss', async () => {
    const cache = makeCache();
    const http = makeHttp();
    cache.get.mockResolvedValue(null);
    http.getExerciseForAttempt.mockResolvedValue(Result.ok(stubDef));
    const client = new CachedContentClient(cache as any, http as any);

    const result = await client.getExerciseForAttempt('ex-1', 'de');

    expect(result.isOk).toBe(true);
    expect(result.value).toEqual(stubDef);
    expect(http.getExerciseForAttempt).toHaveBeenCalledWith('ex-1', 'de');
    expect(cache.set).toHaveBeenCalledWith('ex-1', 'de', stubDef);
  });

  it('returns HTTP error and does not populate cache when HTTP fails', async () => {
    const cache = makeCache();
    const http = makeHttp();
    cache.get.mockResolvedValue(null);
    http.getExerciseForAttempt.mockResolvedValue(
      Result.fail(new ContentClientError(404, 'Not found')),
    );
    const client = new CachedContentClient(cache as any, http as any);

    const result = await client.getExerciseForAttempt('ex-1', 'de');

    expect(result.isFail).toBe(true);
    expect(result.error).toBeInstanceOf(ContentClientError);
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('passes the language parameter correctly to both cache and HTTP', async () => {
    const cache = makeCache();
    const http = makeHttp();
    cache.get.mockResolvedValue(null);
    http.getExerciseForAttempt.mockResolvedValue(Result.ok(stubDef));
    const client = new CachedContentClient(cache as any, http as any);

    await client.getExerciseForAttempt('ex-99', 'fr');

    expect(cache.get).toHaveBeenCalledWith('ex-99', 'fr');
    expect(http.getExerciseForAttempt).toHaveBeenCalledWith('ex-99', 'fr');
    expect(cache.set).toHaveBeenCalledWith('ex-99', 'fr', stubDef);
  });
});
