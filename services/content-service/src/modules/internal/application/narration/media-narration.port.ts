import type { NarrationAssetInfo } from './narration-plan.js';

export const MEDIA_NARRATION_CLIENT = Symbol('MEDIA_NARRATION_CLIENT');

export interface NarrationRequest {
  ownerId: string;
  bodyMarkdown: string;
  lang: string;
  label: string | null;
  lessonId: string;
  /** The course's CEFR level: media-service picks the pace for it. */
  level: string;
  /** Set to keep what an author chose for the narration being replaced. */
  lengthScale?: number;
  pauseScale?: number;
  /** Keep the narrator of the narration being replaced. */
  voiceId?: string;
}

/** media-service's internal narration routes, as the batch uses them. */
export interface IMediaNarrationClient {
  /** Assets by id; unknown ids are absent from the map. */
  describe(assetIds: readonly string[]): Promise<Map<string, NarrationAssetInfo>>;
  /** Queue a narration. `reason` is media-service's refusal (`TEXT_TOO_LONG`, …) or a transport failure. */
  narrate(request: NarrationRequest): Promise<{ assetId: string } | { reason: string }>;
  supersede(assetId: string, byAssetId: string): Promise<boolean>;
}
