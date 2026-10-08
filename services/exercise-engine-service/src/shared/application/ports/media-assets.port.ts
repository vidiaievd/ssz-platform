import type { Result } from '../../kernel/result.js';

export const MEDIA_ASSETS = Symbol('IMediaAssets');

/**
 * What media-service knows about one stored file — the answer of its internal
 * `POST /internal/media/assets/describe` (plan 70, phase 3).
 *
 * `durationMs` is the server's own measurement, taken on `finalize`; the length a client
 * reports for a take is never what a submission is checked against.
 */
export interface MediaAssetDescription {
  id: string;
  ownerId: string;
  entityType: string;
  entityId: string | null;
  status: 'PENDING_UPLOAD' | 'UPLOADED' | 'PROCESSING' | 'READY' | 'FAILED' | 'DELETED';
  mimeType: string;
  sizeBytes: number;
  durationMs: number | null;
}

/**
 * A link a browser can play, from media-service's internal `POST /internal/media/assets/playback`
 * — the mp3 variant once processed, the original until then. Signed for a while and then dead:
 * a link is made when it is handed out, never stored (plan 56 §3.1).
 */
export interface MediaAssetPlayback {
  id: string;
  url: string;
  mimeType: string;
  expiresAt: string;
  durationMs: number | null;
}

export class MediaAssetsError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'MediaAssetsError';
  }
}

/**
 * The engine's two questions to media-service: what are these files, and how are they played.
 *
 * Asked by the submit of a `read_aloud` before anything else is decided (plan 70 §3.5),
 * because the per-type validator is synchronous and cannot make the call itself. Unknown
 * ids are absent from the answer rather than an error — the caller reads a missing id as
 * "no such recording", which is also what a recording owned by somebody else must look like.
 */
export interface IMediaAssets {
  describe(ids: string[]): Promise<Result<MediaAssetDescription[], MediaAssetsError>>;
  /**
   * Playable links for stored files — a `minimal_pairs` probe's clip, the two clips of an A/B
   * comparison, the clips of a pair in the summary (plan 72 §3.6). An id with nothing playable
   * behind it is absent from the answer, not an error.
   */
  playback(ids: string[]): Promise<Result<MediaAssetPlayback[], MediaAssetsError>>;
}
