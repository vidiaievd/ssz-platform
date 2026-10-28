import { jest } from '@jest/globals';
import { HttpRecordingAudioSource } from './http-recording-audio.source.js';

// Plan 82, step 8: "not yet" told from "never" by media's own answers.

const ASSET = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const WAV = new Uint8Array([82, 73, 70, 70]);

type Route = (body: unknown) => Response;

function stubFetch(routes: { playback?: Route; describe?: Route; download?: () => Response }) {
  const seen: Array<{ url: string; body: unknown; token: string | null }> = [];
  const fetchMock = jest.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    seen.push({ url, body, token: new Headers(init?.headers).get('x-internal-token') });
    if (url.endsWith('/assets/playback')) return routes.playback!(body);
    if (url.endsWith('/assets/describe')) return routes.describe!(body);
    return routes.download!();
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return seen;
}

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });

describe('HttpRecordingAudioSource', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  const source = () => new HttpRecordingAudioSource('http://media-service:3004', 'token');

  it('downloads the speech variant from the pre-signed URL', async () => {
    const seen = stubFetch({
      playback: () => json([{ id: ASSET, url: 'http://minio:9000/private/a.wav?sig', mimeType: 'audio/wav' }]),
      download: () => new Response(WAV),
    });
    expect(await source().fetch(ASSET)).toEqual({ kind: 'ready', wav: WAV });
    expect(seen[0]).toEqual({
      url: 'http://media-service:3004/api/v1/internal/media/assets/playback',
      body: { ids: [ASSET], variant: 'speech' },
      token: 'token',
    });
    expect(seen[1]?.url).toBe('http://minio:9000/private/a.wav?sig');
  });

  it.each(['UPLOADED', 'PROCESSING', 'PENDING_UPLOAD'])('answers pending for a recording media holds as %s', async (status) => {
    stubFetch({ playback: () => json([]), describe: () => json([{ id: ASSET, status }]) });
    expect(await source().fetch(ASSET)).toEqual({ kind: 'pending' });
  });

  it.each([
    ['READY without the variant', [{ id: ASSET, status: 'READY' }]],
    ['FAILED', [{ id: ASSET, status: 'FAILED' }]],
    ['unknown', []],
  ])('answers missing for a recording %s', async (_label, described) => {
    stubFetch({ playback: () => json([]), describe: () => json(described) });
    expect(await source().fetch(ASSET)).toEqual({ kind: 'missing' });
  });

  it('throws when media or the storage cannot answer', async () => {
    stubFetch({ playback: () => json({}, 503) });
    await expect(source().fetch(ASSET)).rejects.toThrow('media-service answered 503 to playback');

    stubFetch({
      playback: () => json([{ id: ASSET, url: 'http://minio:9000/a.wav', mimeType: 'audio/wav' }]),
      download: () => new Response('', { status: 403 }),
    });
    await expect(source().fetch(ASSET)).rejects.toThrow('Storage answered 403');
  });
});
