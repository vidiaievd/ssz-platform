import { jest } from '@jest/globals';
import { HttpPitchTracker } from './http-pitch-tracker.js';

// Plan 88, step 6a: the whisper sidecar's `POST /v1/pitch`.

const ANSWER = {
  durationMs: 900,
  referenceHz: 182.4,
  stepMs: 10,
  segments: [{ startMs: 120, endMs: 150, points: [1.2, null, -0.4] }],
  latencyMs: 4,
};

describe('HttpPitchTracker', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  function stub(response: () => Response) {
    const seen: Array<{ url: string; bytes: number; type: string | null }> = [];
    global.fetch = jest.fn(async (input: string | URL | Request, init?: RequestInit) => {
      seen.push({
        url: String(input),
        bytes: (init?.body as Uint8Array).byteLength,
        type: new Headers(init?.headers).get('content-type'),
      });
      return response();
    }) as unknown as typeof fetch;
    return seen;
  }

  it('posts the recording with the spans in the query and returns the curves', async () => {
    const seen = stub(() => new Response(JSON.stringify(ANSWER)));
    const curves = await new HttpPitchTracker('http://whisper:8000').track(Buffer.alloc(44), [
      { startMs: 120.4, endMs: 149.6 },
    ]);
    expect(curves).toEqual({
      durationMs: 900,
      referenceHz: 182.4,
      stepMs: 10,
      curves: [{ startMs: 120, endMs: 150, points: [1.2, null, -0.4] }],
    });
    expect(seen).toEqual([{ url: 'http://whisper:8000/v1/pitch?segments=120-150', bytes: 44, type: 'audio/wav' }]);
  });

  it('reads a recording with no voice as a null reference', async () => {
    stub(() => new Response(JSON.stringify({ ...ANSWER, referenceHz: null })));
    const curves = await new HttpPitchTracker('http://whisper:8000/').track(Buffer.alloc(44), [
      { startMs: 120, endMs: 150 },
    ]);
    expect(curves.referenceHz).toBeNull();
  });

  it('asks nothing without spans', async () => {
    const seen = stub(() => new Response('{}'));
    await expect(new HttpPitchTracker('http://whisper:8000').track(Buffer.alloc(44), [])).rejects.toThrow('no spans');
    expect(seen).toEqual([]);
  });

  it('throws when the image carries no pitch tracker', async () => {
    stub(() => new Response('{"error": "pitch_not_loaded"}', { status: 404 }));
    await expect(
      new HttpPitchTracker('http://whisper:8000').track(Buffer.alloc(44), [{ startMs: 0, endMs: 10 }]),
    ).rejects.toThrow('Pitch tracker answered 404');
  });

  it('throws when a span has no curve', async () => {
    stub(() => new Response(JSON.stringify(ANSWER)));
    await expect(
      new HttpPitchTracker('http://whisper:8000').track(Buffer.alloc(44), [
        { startMs: 0, endMs: 10 },
        { startMs: 20, endMs: 30 },
      ]),
    ).rejects.toThrow('no curve for every span');
  });
});
