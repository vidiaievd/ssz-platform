import { toNarrationScript } from '@ssz/shared-kernel/narration';

import { findAudioTokens } from './lesson-narration-token.js';

/** What the batch needs to know about the asset a lesson body names. */
export interface NarrationAssetInfo {
  status: string;
  /** `UPLOAD` (a person's recording) or `SYNTHESIZED`. */
  origin: string;
  /** `narrationTextHash` of the text a synthesized asset spoke. */
  textHash: string | null;
  /** The pace and pause multiplier it was spoken with; null for an upload or an older synthesis. */
  lengthScale?: number | null;
  pauseScale?: number | null;
  /** The catalog id of the narrator; null for an upload or a narration made before voices were chosen. */
  voiceId?: string | null;
}

export type NarrationSkipReason =
  /** The synthesized narration already speaks this text. */
  | 'current'
  /** A person's recording: never replaced by the batch. */
  | 'recorded'
  /** The body has nothing to read aloud. */
  | 'nothing-to-read'
  /** More than one `[audio:…]` token — which one is the narration is the author's call. */
  | 'several-audio-tokens'
  /** The body names an asset media-service does not know. */
  | 'asset-unknown'
  /** The named narration is still being spoken or processed. */
  | 'in-progress';

export type NarrationVariantPlan =
  | { kind: 'create' }
  | { kind: 'refresh'; replaces: string; why: 'stale' | 'failed' | 'forced' }
  | { kind: 'skip'; reason: NarrationSkipReason; assetId?: string };

const SETTLED_STATUSES = new Set(['READY', 'FAILED']);

/**
 * Decide what the batch does with one lesson body. A person's recording is `recorded` whatever
 * else is true of it, `force` included; only a synthesized narration whose spoken text differs
 * from the body (the same hash the editor shows as "outdated"), that failed, or that is forced is
 * refreshed.
 */
export function planVariantNarration(
  body: string,
  lang: string,
  assetOf: (assetId: string) => NarrationAssetInfo | undefined,
  /** Re-speak a synthesized narration even though its text is current (a new pace or voice). */
  force = false,
): NarrationVariantPlan {
  const script = toNarrationScript(body, lang);
  const tokens = findAudioTokens(body);

  if (tokens.length > 1) return { kind: 'skip', reason: 'several-audio-tokens' };

  if (tokens.length === 0) {
    return script.segments.length === 0 ? { kind: 'skip', reason: 'nothing-to-read' } : { kind: 'create' };
  }

  const assetId = tokens[0]!.mediaId;
  const asset = assetOf(assetId);
  if (!asset) return { kind: 'skip', reason: 'asset-unknown', assetId };
  if (asset.origin !== 'SYNTHESIZED') return { kind: 'skip', reason: 'recorded', assetId };
  if (script.segments.length === 0) return { kind: 'skip', reason: 'nothing-to-read', assetId };
  if (!SETTLED_STATUSES.has(asset.status)) return { kind: 'skip', reason: 'in-progress', assetId };
  if (asset.status === 'FAILED') return { kind: 'refresh', replaces: assetId, why: 'failed' };
  if (asset.textHash !== script.textHash) return { kind: 'refresh', replaces: assetId, why: 'stale' };
  if (force) return { kind: 'refresh', replaces: assetId, why: 'forced' };
  return { kind: 'skip', reason: 'current', assetId };
}

/**
 * A narration refreshed because its text changed or it failed keeps the voice, pace and pauses
 * the author gave it; a forced one starts from the level's defaults again — that is what force is for.
 */
export function keptSettings(
  plan: Exclude<NarrationVariantPlan, { kind: 'skip' }>,
  assets: ReadonlyMap<string, NarrationAssetInfo>,
): { lengthScale?: number; pauseScale?: number; voiceId?: string } {
  if (plan.kind !== 'refresh' || plan.why === 'forced') return {};
  const previous = assets.get(plan.replaces);
  return {
    ...(previous?.lengthScale != null && { lengthScale: previous.lengthScale }),
    ...(previous?.pauseScale != null && { pauseScale: previous.pauseScale }),
    ...(previous?.voiceId != null && { voiceId: previous.voiceId }),
  };
}
