import type { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../../../config/configuration.js';
import { HttpPhraseMarksSuggester } from './http-phrase-marks.suggester.js';

// Plan 86, step 5c.2: words counted here and sent as spans; marks come back by span index.

const config = {
  get: (key: string) =>
    key === 'ai'
      ? { baseUrl: 'http://ai:3010/', timeoutMs: 1000, suggestionTimeoutMs: 5000 }
      : 'internal-token',
} as unknown as ConfigService<AppConfig>;

const REQUEST = {
  schoolId: 's1',
  userId: 'u1',
  language: 'nb',
  text: 'Jeg heter Anna. Er du her?',
};

describe('HttpPhraseMarksSuggester', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  function answer(status: number, body: unknown) {
    const fetchMock = jest
      .fn()
      .mockResolvedValue({ ok: status < 300, status, json: () => Promise.resolve(body) });
    global.fetch = fetchMock as unknown as typeof fetch;
    return fetchMock;
  }

  it('sends the kernel tokens as spans and anchors the marks to them', async () => {
    const fetchMock = answer(200, {
      status: 'ok',
      marks: {
        accents: [2, 9],
        boundaries: [
          { index: 2, pitch: 'fall', pause: 'short' },
          { index: 5, pitch: 'rise', pause: null },
        ],
        links: [3, 5],
      },
      aiCallIds: ['c1'],
    });
    const suggestion = await new HttpPhraseMarksSuggester(config).suggest(REQUEST);

    expect(suggestion).toEqual({
      status: 'ok',
      marks: {
        accents: [{ i: 2, w: 'Anna', source: 'ai' }],
        boundaries: [
          { i: 2, w: 'Anna', pitch: 'fall', pause: 'short', source: 'ai' },
          { i: 5, w: 'her', pitch: 'rise', pause: null, source: 'ai' },
        ],
        // Index 5 is the last word: a link with no next word is dropped.
        links: [{ i: 3, w: 'Er du', source: 'ai' }],
      },
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://ai:3010/api/v1/internal/prosody/phrase-marks');
    expect((init.headers as Record<string, string>)['x-internal-token']).toBe('internal-token');
    expect(JSON.parse(init.body as string)).toEqual({
      ...REQUEST,
      spans: [
        [0, 3],
        [4, 9],
        [10, 14],
        [16, 18],
        [19, 21],
        [22, 25],
      ],
    });
  });

  it('passes a refusal and a failure on', async () => {
    answer(200, { status: 'refused', reason: 'pool_empty' });
    expect(await new HttpPhraseMarksSuggester(config).suggest(REQUEST)).toEqual({
      status: 'refused',
      reason: 'pool_empty',
    });

    answer(200, { status: 'failed', errorCode: 'invalid_response', aiCallIds: ['c1'] });
    expect(await new HttpPhraseMarksSuggester(config).suggest(REQUEST)).toEqual({
      status: 'failed',
      errorCode: 'invalid_response',
    });
  });

  it('is a failure when ai-service refuses the request or is away', async () => {
    answer(400, {});
    expect(await new HttpPhraseMarksSuggester(config).suggest(REQUEST)).toEqual({
      status: 'failed',
      errorCode: 'http_400',
    });

    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('connect ECONNREFUSED')) as unknown as typeof fetch;
    expect(await new HttpPhraseMarksSuggester(config).suggest(REQUEST)).toEqual({
      status: 'failed',
      errorCode: 'unreachable',
    });
  });
});
