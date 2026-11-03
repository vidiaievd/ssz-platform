import type { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../../../config/configuration.js';
import { HttpLexiconStressSource } from './http-lexicon-stress.source.js';

// Plan 86, step 5b: the words are counted here and sent as spans; the answer comes back by span.

const config = {
  get: (key: string) =>
    key === 'ai' ? { baseUrl: 'http://ai:3010/', timeoutMs: 1000 } : 'internal-token',
} as unknown as ConfigService<AppConfig>;

describe('HttpLexiconStressSource', () => {
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

  it('sends the kernel tokens as spans and anchors the answer to them', async () => {
    const fetchMock = answer(200, {
      words: [{ index: 1, toneme: 2, vowel: { s: 1, e: 2, long: true } }],
    });
    const stresses = await new HttpLexiconStressSource(config).stressesOf('nb', 'Jeg heter Anna.');

    expect(stresses).toEqual([
      { i: 1, w: 'heter', toneme: 2, vowel: { s: 1, e: 2, long: true }, source: 'lexicon' },
    ]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://ai:3010/api/v1/internal/prosody/word-stresses');
    expect((init.headers as Record<string, string>)['x-internal-token']).toBe('internal-token');
    expect(JSON.parse(init.body as string)).toEqual({
      language: 'nb',
      text: 'Jeg heter Anna.',
      spans: [
        [0, 3],
        [4, 9],
        [10, 14],
      ],
    });
  });

  it('drops an answer that does not fit its word', async () => {
    answer(200, {
      words: [
        { index: 7, toneme: 1, vowel: { s: 0, e: 1, long: false } },
        { index: 0, toneme: null, vowel: { s: 1, e: 9, long: false } },
      ],
    });
    expect(await new HttpLexiconStressSource(config).stressesOf('nb', 'Jeg heter')).toEqual([]);
  });

  it('goes without the lexicon when ai-service refuses or is away', async () => {
    answer(503, {});
    expect(await new HttpLexiconStressSource(config).stressesOf('nb', 'Jeg heter')).toEqual([]);
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;
    expect(await new HttpLexiconStressSource(config).stressesOf('nb', 'Jeg heter')).toEqual([]);
  });

  it('asks nothing for a text without words', async () => {
    const fetchMock = answer(200, { words: [] });
    expect(await new HttpLexiconStressSource(config).stressesOf('nb', ' — ')).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
