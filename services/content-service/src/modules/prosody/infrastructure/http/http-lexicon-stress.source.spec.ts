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
    const { stresses } = await new HttpLexiconStressSource(config).wordsOf('nb', 'Jeg heter Anna.');

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
    expect((await new HttpLexiconStressSource(config).wordsOf('nb', 'Jeg heter')).stresses).toEqual(
      [],
    );
  });

  it('goes without the lexicon when ai-service refuses or is away', async () => {
    answer(503, {});
    const none = { stresses: [], sounds: [], unresolved: [] };
    expect(await new HttpLexiconStressSource(config).wordsOf('nb', 'Jeg heter')).toEqual(none);
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;
    expect(await new HttpLexiconStressSource(config).wordsOf('nb', 'Jeg heter')).toEqual(none);
  });

  it('asks nothing for a text without words', async () => {
    const fetchMock = answer(200, { words: [] });
    expect(await new HttpLexiconStressSource(config).wordsOf('nb', ' — ')).toEqual({
      stresses: [],
      sounds: [],
      unresolved: [],
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('anchors the sounds to the words and drops the ones that do not lie over their letters', async () => {
    const seg = (s: number, e: number, kind: string) => ({
      s,
      e,
      kind,
      sounds: kind === 'silent' ? [] : ['X'],
      stress: null,
      long: null,
      tie: false,
    });
    answer(200, {
      words: [],
      sounds: [
        { index: 0, segs: [seg(0, 1, 'consonant'), seg(1, 3, 'vowel')] },
        // *heter* is five letters; this lies over four.
        { index: 1, segs: [seg(0, 4, 'consonant')] },
        // A kind the kernel does not know.
        { index: 2, segs: [seg(0, 4, 'weird')] },
        { index: 9, segs: [seg(0, 1, 'consonant')] },
      ],
    });
    const { sounds } = await new HttpLexiconStressSource(config).wordsOf('nb', 'Jeg heter Anna.');
    expect(sounds.map((x) => [x.i, x.w])).toEqual([[0, 'Jeg']]);
  });

  it('anchors the unresolved words and goes without them from an older ai-service', async () => {
    answer(200, { words: [], unresolved: [0, 9, 1.5] });
    const { unresolved } = await new HttpLexiconStressSource(config).wordsOf('nb', 'Bartek søker.');
    expect(unresolved).toEqual([{ i: 0, w: 'Bartek' }]);
    answer(200, { words: [] });
    expect((await new HttpLexiconStressSource(config).wordsOf('nb', 'Bartek')).unresolved).toEqual(
      [],
    );
  });
});
