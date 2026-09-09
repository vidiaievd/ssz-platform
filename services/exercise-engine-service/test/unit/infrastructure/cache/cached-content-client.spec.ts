import { jest } from '@jest/globals';
import { CachedContentClient } from '../../../../src/infrastructure/cache/cached-content-client.js';
import { ContentClientError } from '../../../../src/shared/application/ports/content-client.port.js';
import { Result } from '../../../../src/shared/kernel/result.js';
import type {
  ExerciseDefinition,
  ExercisePlacement,
} from '../../../../src/shared/application/ports/content-client.port.js';

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
  getExercisePlacement:
    jest.fn<() => Promise<Result<ExercisePlacement, ContentClientError>>>(),
});

const makePlacementCache = () => ({
  get: jest.fn<() => Promise<ExercisePlacement | null>>().mockResolvedValue(null),
  set: jest.fn<() => Promise<void>>(),
});

const stubPlacement: ExercisePlacement = {
  containerId: 'course-1',
  containerTitle: 'Ny i Norge A2',
  moduleId: 'module-1',
  moduleTitle: 'Leksjon 7',
  exerciseTitle: 'Perfektum',
  ownerSchoolId: 'school-1',
};

describe('CachedContentClient', () => {
  it('returns cached value without calling HTTP client on cache hit', async () => {
    const cache = makeCache();
    const http = makeHttp();
    cache.get.mockResolvedValue(stubDef);
    const client = new CachedContentClient(cache as any, makePlacementCache() as any, http as any);

    const result = await client.getExerciseForAttempt('ex-1', 'de', 'PRACTICE');

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
    const client = new CachedContentClient(cache as any, makePlacementCache() as any, http as any);

    const result = await client.getExerciseForAttempt('ex-1', 'de', 'PRACTICE');

    expect(result.isOk).toBe(true);
    expect(result.value).toEqual(stubDef);
    expect(http.getExerciseForAttempt).toHaveBeenCalledWith('ex-1', 'de', 'PRACTICE');
    expect(cache.set).toHaveBeenCalledWith('ex-1', 'de', 'PRACTICE', stubDef);
  });

  it('returns HTTP error and does not populate cache when HTTP fails', async () => {
    const cache = makeCache();
    const http = makeHttp();
    cache.get.mockResolvedValue(null);
    http.getExerciseForAttempt.mockResolvedValue(
      Result.fail(new ContentClientError(404, 'Not found')),
    );
    const client = new CachedContentClient(cache as any, makePlacementCache() as any, http as any);

    const result = await client.getExerciseForAttempt('ex-1', 'de', 'PRACTICE');

    expect(result.isFail).toBe(true);
    expect(result.error).toBeInstanceOf(ContentClientError);
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('passes the language parameter correctly to both cache and HTTP', async () => {
    const cache = makeCache();
    const http = makeHttp();
    cache.get.mockResolvedValue(null);
    http.getExerciseForAttempt.mockResolvedValue(Result.ok(stubDef));
    const client = new CachedContentClient(cache as any, makePlacementCache() as any, http as any);

    await client.getExerciseForAttempt('ex-99', 'fr', 'PRACTICE');

    expect(cache.get).toHaveBeenCalledWith('ex-99', 'fr', 'PRACTICE');
    expect(http.getExerciseForAttempt).toHaveBeenCalledWith('ex-99', 'fr', 'PRACTICE');
    expect(cache.set).toHaveBeenCalledWith('ex-99', 'fr', 'PRACTICE', stubDef);
  });

  describe('getExercisePlacement', () => {
    it('returns the cached placement without calling HTTP on a cache hit', async () => {
      const placementCache = makePlacementCache();
      placementCache.get.mockResolvedValue(stubPlacement);
      const http = makeHttp();
      const client = new CachedContentClient(makeCache() as any, placementCache as any, http as any);

      const result = await client.getExercisePlacement('ex-1');

      expect(result.isOk).toBe(true);
      expect(result.value).toEqual(stubPlacement);
      expect(http.getExercisePlacement).not.toHaveBeenCalled();
    });

    it('calls HTTP and populates the cache on a miss', async () => {
      const placementCache = makePlacementCache();
      const http = makeHttp();
      http.getExercisePlacement.mockResolvedValue(Result.ok(stubPlacement));
      const client = new CachedContentClient(makeCache() as any, placementCache as any, http as any);

      const result = await client.getExercisePlacement('ex-1');

      expect(result.isOk).toBe(true);
      expect(http.getExercisePlacement).toHaveBeenCalledWith('ex-1');
      expect(placementCache.set).toHaveBeenCalledWith('ex-1', stubPlacement);
    });

    it('does not populate the cache when HTTP fails', async () => {
      const placementCache = makePlacementCache();
      const http = makeHttp();
      http.getExercisePlacement.mockResolvedValue(Result.fail(new ContentClientError(404, 'Not placed')));
      const client = new CachedContentClient(makeCache() as any, placementCache as any, http as any);

      const result = await client.getExercisePlacement('ex-1');

      expect(result.isFail).toBe(true);
      expect(placementCache.set).not.toHaveBeenCalled();
    });
  });
});
