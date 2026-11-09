import { jest } from '@jest/globals';
import { HttpPosTagger } from './http-pos-tagger.js';

// Plan 88, step 4b: the whisper sidecar's `POST /v1/tag`.

const TOKEN = { text: 'Fokuser', start: 0, end: 7, upos: 'VERB', morph: 'Mood=Imp|VerbForm=Fin', sentStart: true };

describe('HttpPosTagger', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  function stub(response: () => Response) {
    const seen: Array<{ url: string; body: unknown }> = [];
    global.fetch = jest.fn(async (input: string | URL | Request, init?: RequestInit) => {
      seen.push({ url: String(input), body: JSON.parse(String(init?.body)) });
      return response();
    }) as unknown as typeof fetch;
    return seen;
  }

  it('posts the passage and returns the tokens', async () => {
    const seen = stub(() => new Response(JSON.stringify({ tokens: [TOKEN], model: 'nb_core_news_md' })));
    expect(await new HttpPosTagger('http://whisper:8000').tag('nb', 'Fokuser!')).toEqual([TOKEN]);
    expect(seen).toEqual([{ url: 'http://whisper:8000/v1/tag?language=nb', body: { text: 'Fokuser!' } }]);
  });

  it('asks nothing for a language without a tagger', async () => {
    const seen = stub(() => new Response('{}'));
    expect(await new HttpPosTagger('http://whisper:8000').tag('en', 'Focus!')).toEqual([]);
    expect(seen).toEqual([]);
  });

  it('throws when the image carries no tagger', async () => {
    stub(() => new Response('{"error": "tagger_not_loaded"}', { status: 404 }));
    await expect(new HttpPosTagger('http://whisper:8000').tag('nb', 'Fokuser!')).rejects.toThrow('Tagger answered 404');
  });

  it('throws on an answer without tokens', async () => {
    stub(() => new Response('{}'));
    await expect(new HttpPosTagger('http://whisper:8000/').tag('nb', 'Fokuser!')).rejects.toThrow('no tokens');
  });
});
