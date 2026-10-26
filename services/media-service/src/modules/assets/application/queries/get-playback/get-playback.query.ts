import { IQuery } from '@nestjs/cqrs';

// A reviewer's player for a submission's recordings (plan 70, Q2-A). The caller — the
// review BFF — has already had the engine confirm the submission is the reviewer's.
//
// `speech` is the same route for a machine listener (plan 82, step 5): ai-service asks for
// the WAV a recogniser takes. It has no fallback — an asset without the variant (still
// processing, made before the variant existed, or not a recording) is left out, and the
// caller tells those apart by describing the asset.
export type PlaybackVariant = 'playback' | 'speech';

export interface AssetPlayback {
  id: string;
  /** `playback`: the mp3 variant once processed, the original until then. `speech`: the WAV. */
  url: string;
  mimeType: string;
  expiresAt: string;
  durationMs: number | null;
  /** Null until processing has drawn the waveform — the queue draws a flat bar meanwhile. */
  peaks: number[] | null;
}

export class GetPlaybackQuery implements IQuery {
  constructor(
    readonly ids: readonly string[],
    readonly variant: PlaybackVariant = 'playback',
  ) {}
}
