import type { IRecordingAudioSource, RecordingAudio } from '../application/ports/recording-audio.source.js';

/** Media is still working on these: the speech variant is coming. */
const IN_PROGRESS = new Set(['PENDING_UPLOAD', 'UPLOADED', 'PROCESSING']);

/** Twice the longest take a sidecar takes (120 s of 16 kHz 16-bit mono is 3.84 MB). */
const MAX_WAV_BYTES = 8 * 1024 * 1024;

/**
 * media-service's internal routes (`x-internal-token`, `/api/v1` prefix): `playback` with
 * `variant: "speech"` gives a pre-signed URL of the WAV (plan 82, step 5); without it in the
 * answer, `describe` tells "not yet" from "never".
 *
 * The URL is signed for the storage's public host (`MINIO_PUBLIC_BASE_URL`) and cannot be
 * re-hosted after signing, so this service must reach that host too.
 */
export class HttpRecordingAudioSource implements IRecordingAudioSource {
  constructor(
    private readonly baseUrl: string,
    private readonly internalToken: string,
    private readonly timeoutMs = 5_000,
    private readonly downloadTimeoutMs = 30_000,
  ) {}

  async fetch(assetId: string): Promise<RecordingAudio> {
    const [playback] = await this.post<Array<{ id: string; url: string; mimeType: string }>>('playback', {
      ids: [assetId],
      variant: 'speech',
    });
    if (playback?.id === assetId) return { kind: 'ready', wav: await this.download(assetId, playback.url) };

    const [described] = await this.post<Array<{ id: string; status: string }>>('describe', { ids: [assetId] });
    return described?.id === assetId && IN_PROGRESS.has(described.status) ? { kind: 'pending' } : { kind: 'missing' };
  }

  private async download(assetId: string, url: string): Promise<Uint8Array> {
    const res = await fetch(url, { signal: AbortSignal.timeout(this.downloadTimeoutMs) });
    if (!res.ok) throw new Error(`Storage answered ${res.status} for the speech variant of ${assetId}`);
    const length = Number(res.headers.get('content-length') ?? '0');
    if (length > MAX_WAV_BYTES) throw new Error(`Speech variant of ${assetId} is ${length} bytes, over ${MAX_WAV_BYTES}`);
    const wav = new Uint8Array(await res.arrayBuffer());
    if (wav.byteLength > MAX_WAV_BYTES) throw new Error(`Speech variant of ${assetId} is over ${MAX_WAV_BYTES} bytes`);
    return wav;
  }

  private async post<T>(route: 'playback' | 'describe', body: unknown): Promise<T> {
    const res = await fetch(new URL(`/api/v1/internal/media/assets/${route}`, this.baseUrl), {
      method: 'POST',
      headers: { 'x-internal-token': this.internalToken, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) throw new Error(`media-service answered ${res.status} to ${route}`);
    return (await res.json()) as T;
  }
}
