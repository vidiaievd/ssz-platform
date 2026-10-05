import { IQuery } from '@nestjs/cqrs';

// A reviewer's player for a submission's recordings (plan 70, Q2-A). The caller — the
// review BFF — has already had the engine confirm the submission is the reviewer's.
export interface AssetPlayback {
  id: string;
  /** The mp3 variant once processed; the original until then. */
  url: string;
  mimeType: string;
  expiresAt: string;
  durationMs: number | null;
  /** Null until processing has drawn the waveform — the queue draws a flat bar meanwhile. */
  peaks: number[] | null;
}

export class GetPlaybackQuery implements IQuery {
  constructor(readonly ids: readonly string[]) {}
}
