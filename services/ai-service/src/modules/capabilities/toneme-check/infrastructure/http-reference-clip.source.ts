import type { IRecordingAudioSource } from '../../voice-review/application/ports/recording-audio.source.js';
import { storedReferenceOf } from '../domain/stored-reference.js';
import type { IReferenceClipSource, ReferenceClipAudio } from '../application/ports/reference-clip.source.js';

/**
 * A reference clip from media-service (plan 88, step 8.2): `describe` gives its self-check
 * (`reference`), then the speech variant comes the way a recording's does. Described first, so an
 * asset that is not a reference costs no download.
 */
export class HttpReferenceClipSource implements IReferenceClipSource {
  constructor(
    private readonly baseUrl: string,
    private readonly internalToken: string,
    private readonly audio: IRecordingAudioSource,
    private readonly timeoutMs = 5_000,
  ) {}

  async fetch(assetId: string): Promise<ReferenceClipAudio> {
    const res = await fetch(new URL('/api/v1/internal/media/assets/describe', this.baseUrl), {
      method: 'POST',
      headers: {
        'x-internal-token': this.internalToken,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({ ids: [assetId] }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) throw new Error(`media-service answered ${res.status} to describe`);
    const [described] = (await res.json()) as Array<{ id: string; reference?: unknown }>;
    if (described?.id !== assetId) return { kind: 'missing' };

    const reference = storedReferenceOf(described.reference ?? null);
    if (typeof reference === 'string') return { kind: reference };
    const audio = await this.audio.fetch(assetId);
    return audio.kind === 'ready' ? { kind: 'ready', wav: audio.wav, reference } : audio;
  }
}
