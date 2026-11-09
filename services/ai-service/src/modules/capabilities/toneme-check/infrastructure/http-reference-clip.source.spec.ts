import { jest } from '@jest/globals';
import type {
  IRecordingAudioSource,
  RecordingAudio,
} from '../../voice-review/application/ports/recording-audio.source.js';
import { HttpReferenceClipSource } from './http-reference-clip.source.js';

const ASSET = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const WAV = new Uint8Array([82, 73, 70, 70]);
const REFERENCE = {
  word: 'bønner',
  sentence: 'Nå sier jeg bønner igjen.',
  tone: 2,
  wordSpan: { startMs: 820, endMs: 1240 },
  stressedVowel: { startMs: 870, endMs: 940 },
  tries: [
    {
      voice: 'nb-NO-PernilleNeural',
      outcome: 'kept',
      accuracy: 98,
      measure: { onset: 2.1, post: -1.2, score: 3.3, tone: 2 },
    },
  ],
};

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });

describe('HttpReferenceClipSource (plan 88, step 8.2)', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  function setup(described: () => Response, audio: RecordingAudio = { kind: 'ready', wav: WAV }) {
    const seen: Array<{ url: string; body: unknown; token: string | null }> = [];
    global.fetch = jest.fn(async (input: string | URL | Request, init?: RequestInit) => {
      seen.push({
        url: String(input),
        body: JSON.parse(String(init?.body)),
        token: new Headers(init?.headers).get('x-internal-token'),
      });
      return described();
    }) as unknown as typeof fetch;
    const recordings = { fetch: jest.fn(async () => audio) };
    const source = new HttpReferenceClipSource(
      'http://media-service:3004',
      'token',
      recordings as IRecordingAudioSource,
    );
    return { seen, recordings, source };
  }

  it('describes the clip, then fetches its speech variant', async () => {
    const { seen, recordings, source } = setup(() => json([{ id: ASSET, status: 'READY', reference: REFERENCE }]));
    expect(await source.fetch(ASSET)).toEqual({
      kind: 'ready',
      wav: WAV,
      reference: expect.objectContaining({ tone: 2, score: 3.3, stressedVowel: { startMs: 870, endMs: 940 } }),
    });
    expect(seen).toEqual([
      {
        url: 'http://media-service:3004/api/v1/internal/media/assets/describe',
        body: { ids: [ASSET] },
        token: 'token',
      },
    ]);
    expect(recordings.fetch).toHaveBeenCalledWith(ASSET);
  });

  it('downloads nothing for an asset that is no reference or has no toneme', async () => {
    const plain = setup(() => json([{ id: ASSET, status: 'READY', reference: null }]));
    expect(await plain.source.fetch(ASSET)).toEqual({ kind: 'not_a_reference' });
    expect(plain.recordings.fetch).not.toHaveBeenCalled();

    const hus = setup(() => json([{ id: ASSET, reference: { ...REFERENCE, tone: null, stressedVowel: null } }]));
    expect(await hus.source.fetch(ASSET)).toEqual({ kind: 'no_toneme' });
  });

  it('answers missing for an unknown asset and passes on a pending variant', async () => {
    expect(await setup(() => json([])).source.fetch(ASSET)).toEqual({ kind: 'missing' });
    const pending = setup(() => json([{ id: ASSET, reference: REFERENCE }]), { kind: 'pending' });
    expect(await pending.source.fetch(ASSET)).toEqual({ kind: 'pending' });
  });

  it('throws when media cannot answer', async () => {
    await expect(setup(() => json({}, 503)).source.fetch(ASSET)).rejects.toThrow(
      'media-service answered 503 to describe',
    );
  });
});
