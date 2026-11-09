import type { IPitchTracker, PitchCurve, PitchCurves, PitchSpan } from '../../application/ports/pitch-tracker.js';

/**
 * The whisper sidecar's `POST /v1/pitch?segments=` (`infrastructure/whisper/server.py`): the WAV as
 * the body, the spans as `start-end` pairs in the query. Keyless, on the platform network like
 * `/v1/tag`. A 404 means the image carries no pitch tracker — an error like any other here.
 */
export class HttpPitchTracker implements IPitchTracker {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs = 5_000,
  ) {}

  async track(wav: Buffer, spans: readonly PitchSpan[]): Promise<PitchCurves> {
    if (spans.length === 0) throw new Error('Pitch tracker: no spans to measure');
    const url = new URL('v1/pitch', this.baseUrl.endsWith('/') ? this.baseUrl : `${this.baseUrl}/`);
    url.searchParams.set('segments', spans.map((s) => `${Math.round(s.startMs)}-${Math.round(s.endMs)}`).join(','));
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'audio/wav', accept: 'application/json' },
      body: new Uint8Array(wav),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) {
      throw new Error(`Pitch tracker answered ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
    }
    const body = (await res.json()) as {
      durationMs?: unknown;
      referenceHz?: unknown;
      stepMs?: unknown;
      segments?: unknown;
    };
    if (!Array.isArray(body.segments) || body.segments.length !== spans.length || typeof body.stepMs !== 'number') {
      throw new Error('Pitch tracker answer has no curve for every span');
    }
    return {
      durationMs: Number(body.durationMs),
      referenceHz: typeof body.referenceHz === 'number' ? body.referenceHz : null,
      stepMs: body.stepMs,
      curves: body.segments as PitchCurve[],
    };
  }
}
