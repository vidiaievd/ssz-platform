import { jest } from '@jest/globals';
import { of, throwError } from 'rxjs';
import { AxiosError } from 'axios';
import {
  HttpLearnerSoundsReader,
  HttpSoundDrillReader,
  HttpSoundTakeJudge,
} from '../../../src/modules/sound-sessions/infrastructure/http/http-sound-session-sources.js';
import { SoundSessionSourceError } from '../../../src/modules/sound-sessions/application/ports/sound-session.ports.js';

const axiosError = (status: number | null, message: string): AxiosError => {
  const err = new AxiosError(message);
  if (status !== null) {
    err.response = { status, data: { message }, statusText: String(status), headers: {}, config: {} as any };
  }
  return err;
};

const http = { get: jest.fn<any>(), post: jest.fn<any>() };
const config = {
  get: jest.fn().mockImplementation((key: unknown) => {
    const map: Record<string, unknown> = {
      learning: { baseUrl: 'http://learning-service:3007', timeoutMs: 2000 },
      content: { baseUrl: 'http://content-service:3003', timeoutMs: 2000, retries: 2 },
      ai: { baseUrl: 'http://ai-service:3010', timeoutMs: 110000 },
      internalServiceToken: 'test-token',
    };
    return map[key as string];
  }),
};

beforeEach(() => jest.clearAllMocks());

describe('HttpLearnerSoundsReader', () => {
  const reader = () => new HttpLearnerSoundsReader(http as any, config as any);

  it("asks learning's prefixed route with x-service-token, not x-internal-token", async () => {
    http.get.mockReturnValue(of({ data: { cards: [], flags: [], flagsFrom: '2026-10-25' } }));
    await reader().read('user-1', 'nb');
    expect(http.get).toHaveBeenCalledWith(
      'http://learning-service:3007/api/v1/internal/learners/user-1/sound-atoms',
      expect.objectContaining({ params: { language: 'nb' }, headers: { 'x-service-token': 'test-token' }, timeout: 2000 }),
    );
  });

  it('keeps what the plan reads', async () => {
    http.get.mockReturnValue(
      of({
        data: {
          cards: [{ atomId: 'nb:kj', due: true, dueAt: '2026-11-07T00:00:00Z', stability: 1, reps: 2, lapses: 0 }],
          flags: [{ atomId: 'nb:sj', days: 2, lastFlaggedOn: '2026-11-06', bySource: { ai_voice: 2 }, hasCard: false }],
          flagsFrom: '2026-10-25',
        },
      }),
    );
    const result = await reader().read('user-1', 'nb');
    expect(result.value).toEqual({
      cards: [{ atomId: 'nb:kj', due: true }],
      flags: [{ atomId: 'nb:sj', days: 2, lastFlaggedOn: '2026-11-06', hasCard: false }],
    });
  });

  it('an answer without cards is not «no record» — it is a failure', async () => {
    http.get.mockReturnValue(of({ data: { message: 'oops' } }));
    const result = await reader().read('user-1', 'nb');
    expect(result.isFail).toBe(true);
    expect(result.error).toMatchObject({ source: 'learning', statusCode: 502 });
  });

  it('a 401 is reported as such, not as an empty record', async () => {
    http.get.mockReturnValue(throwError(() => axiosError(401, 'Invalid or missing x-service-token')));
    const result = await reader().read('user-1', 'nb');
    expect(result.error).toBeInstanceOf(SoundSessionSourceError);
    expect(result.error).toMatchObject({ source: 'learning', statusCode: 401 });
  });
});

describe('HttpSoundDrillReader', () => {
  const reader = () => new HttpSoundDrillReader(http as any, config as any);
  const set = { language: 'nb', atoms: [], diagnostic: [] };

  it('every sound when none named', async () => {
    http.get.mockReturnValue(of({ data: set }));
    const result = await reader().read('nb', []);
    expect(result.value).toEqual(set);
    expect(http.get).toHaveBeenCalledWith(
      'http://content-service:3003/api/v1/internal/sound-atoms/drill',
      expect.objectContaining({ params: { language: 'nb' }, headers: { 'x-internal-token': 'test-token' } }),
    );
  });

  it('the named sounds, comma-joined', async () => {
    http.get.mockReturnValue(of({ data: set }));
    await reader().read('nb', ['nb:kj', 'nb:sj']);
    expect(http.get).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ params: { language: 'nb', atomIds: 'nb:kj,nb:sj' } }),
    );
  });

  it("content-service's nested clips become the plan's flat words", async () => {
    const ref = (assetId: string, tone: 1 | 2 | null = null) => ({ assetId, tone });
    http.get.mockReturnValue(
      of({
        data: {
          language: 'nb',
          atoms: [
            {
              atomId: 'nb:tone',
              family: 'tone',
              words: [{ word: 'jente', reference: ref('a1', 2) }, { word: 'broken' }],
              pairs: [
                [{ word: 'fisken', reference: ref('a2', 1) }, { word: 'fiske', reference: ref('a3', 2) }],
                [{ word: 'half', reference: ref('a4') }, { word: 'missing' }],
              ],
              phrases: [
                {
                  text: 'Jenta fisker.',
                  carriers: [{ word: 'Jenta', reference: null }, { word: 'fisker', reference: ref('a5') }],
                  source: 'uttale-09:p1',
                },
              ],
            },
          ],
          diagnostic: [{ atomId: 'nb:tone', word: { word: 'jente', reference: ref('a1', 2) } }, { atomId: 'nb:kj' }],
        },
      }),
    );
    const result = await reader().read('nb', ['nb:tone']);
    expect(result.value).toEqual({
      language: 'nb',
      atoms: [
        {
          atomId: 'nb:tone',
          family: 'tone',
          words: [{ word: 'jente', assetId: 'a1', tone: 2 }],
          pairs: [[{ word: 'fisken', assetId: 'a2', tone: 1 }, { word: 'fiske', assetId: 'a3', tone: 2 }]],
          phrases: [
            {
              text: 'Jenta fisker.',
              carriers: [{ word: 'Jenta', assetId: null }, { word: 'fisker', assetId: 'a5' }],
              source: 'uttale-09:p1',
            },
          ],
        },
      ],
      diagnostic: [{ atomId: 'nb:tone', word: { word: 'jente', assetId: 'a1', tone: 2 } }],
    });
  });

  it('content-service away → 503', async () => {
    http.get.mockReturnValue(throwError(() => axiosError(null, 'connect ECONNREFUSED')));
    const result = await reader().read('nb', []);
    expect(result.error).toMatchObject({ source: 'content', statusCode: 503 });
  });
});

describe('HttpSoundTakeJudge', () => {
  const judge = () => new HttpSoundTakeJudge(http as any, config as any);
  const take = {
    schoolId: null,
    userId: 'user-1',
    sessionId: 'attempt-1',
    exerciseId: 'probe-1',
    language: 'nb',
    explanationLanguage: 'ru',
    sentence: 'Nå sier jeg kino igjen.',
    recordingAssetId: 'rec-1',
    target: { atomId: 'nb:kj', words: ['kino'], context: 'word' as const, explained: [] },
  };

  it('sends the target to sentence-checks', async () => {
    http.post.mockReturnValue(of({ data: { status: 'ok', feedback: {}, aiCallIds: ['c1'] } }));
    const result = await judge().sounds(take);
    expect(http.post).toHaveBeenCalledWith(
      'http://ai-service:3010/api/v1/internal/sentence-checks',
      take,
      expect.objectContaining({ headers: { 'x-internal-token': 'test-token' }, timeout: 110000 }),
    );
    // An ok without a target is normalised to `target: null`.
    expect(result.value).toEqual({ status: 'ok', feedback: {}, aiCallIds: ['c1'], target: null });
  });

  it('a toneme take goes to toneme-checks; unheard is an outcome', async () => {
    const answer = { status: 'unheard', reason: 'word_not_heard', accuracy: null, aiCallIds: [] };
    http.post.mockReturnValue(of({ data: answer }));
    const request = {
      schoolId: 'school-1',
      userId: 'user-1',
      sessionId: 'attempt-1',
      language: 'nb',
      word: 'fiske',
      recordingAssetId: 'rec-1',
      referenceAssetId: 'ref-1',
    };
    const result = await judge().toneme(request);
    expect(http.post).toHaveBeenCalledWith(
      'http://ai-service:3010/api/v1/internal/toneme-checks',
      request,
      expect.anything(),
    );
    expect(result.value).toEqual(answer);
  });

  it("asks ai-service's door of a session (step 14.1); a refusal is an outcome", async () => {
    const answer = { status: 'refused', reason: 'session_limit', retryAfterMs: 1000 };
    http.post.mockReturnValue(of({ data: answer }));
    const request = { userId: 'user-1', schoolId: null, resume: false };
    const result = await judge().admit(request);
    expect(http.post).toHaveBeenCalledWith(
      'http://ai-service:3010/api/v1/internal/sound-sessions/admit',
      request,
      expect.objectContaining({ headers: { 'x-internal-token': 'test-token' } }),
    );
    expect(result.value).toEqual(answer);
  });

  it('an answer without an outcome is a 502', async () => {
    http.post.mockReturnValue(of({ data: { status: 'maybe' } }));
    const result = await judge().sounds(take);
    expect(result.error).toMatchObject({ source: 'ai', statusCode: 502 });
  });

  it('ai-service away → 503', async () => {
    http.post.mockReturnValue(throwError(() => axiosError(null, 'socket hang up')));
    const result = await judge().sounds(take);
    expect(result.error).toMatchObject({ source: 'ai', statusCode: 503 });
  });
});
