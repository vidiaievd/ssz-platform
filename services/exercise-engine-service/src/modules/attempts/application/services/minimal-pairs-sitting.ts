import { randomInt } from 'node:crypto';
import type { Rand } from '@ssz/shared-kernel/minimal-pairs';
import type {
  IMediaAssets,
  MediaAssetPlayback,
} from '../../../../shared/application/ports/media-assets.port.js';

/**
 * What the engine needs around a `minimal_pairs` sitting (plan 72 §3.6), in one place for the
 * four commands that touch it — start, hand out, answer and submit.
 *
 * The kernel holds the judgement: the sampler, the judge, the views of a probe. What lives here
 * is where those meet the attempt — the draw stored on it, the picks recorded in its
 * `picked_options` under `p<n>`, and the links media-service signs for the clips.
 */

export {
  closedResults,
  currentProbe,
  drawOf,
  historyFor,
  probeQuestionId,
  probeStatesOf,
} from './minimal-pairs-attempt.js';

/**
 * The random source of a real draw: the platform CSPRNG, not the prototype's LCG. The order is
 * the key's neighbour — a draw a student could replay from a seed is a draw they could know.
 */
export function cspRand(): Rand {
  return () => randomInt(0, 2 ** 32) / 2 ** 32;
}

/**
 * Signed links for a set of clips, by asset id. A clip media-service cannot play — not there,
 * not processed, media-service away — is simply missing from the map: the runner shows the
 * probe without sound rather than the sitting failing, and the student can still answer.
 */
export async function playbackOf(
  media: IMediaAssets | null,
  assetIds: readonly string[],
): Promise<Map<string, MediaAssetPlayback>> {
  const ids = [...new Set(assetIds.filter((id) => id !== ''))];
  if (media === null || ids.length === 0) return new Map();
  const result = await media.playback(ids);
  return result.isOk ? new Map(result.value.map((p) => [p.id, p])) : new Map();
}
