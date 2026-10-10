import { randomInt } from 'node:crypto';
import {
  contrastsInSet,
  historyFrom,
  probeNumber,
  probeQuestionId,
  readDraw,
  readProbeRecords,
} from '@ssz/shared-kernel/minimal-pairs';
import type {
  DealtProbe,
  History,
  MinimalPairsContent,
  ProbeState,
  Rand,
} from '@ssz/shared-kernel/minimal-pairs';
import type { Attempt } from '../../domain/entities/attempt.entity.js';
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

/**
 * The random source of a real draw: the platform CSPRNG, not the prototype's LCG. The order is
 * the key's neighbour — a draw a student could replay from a seed is a draw they could know.
 */
export function cspRand(): Rand {
  return () => randomInt(0, 2 ** 32) / 2 ** 32;
}

/** The draw stored on the attempt; empty for an attempt that drew nothing. */
export function drawOf(attempt: Attempt): DealtProbe[] {
  return readDraw(attempt.probeDraw);
}

/** Each probe's picks as the kernel's judge reads them, from the attempt's own record. */
export function probeStatesOf(attempt: Attempt): ProbeState[] {
  return attempt.pickedOptions.flatMap((q): ProbeState[] => {
    const n = probeNumber(q.questionId);
    return n === null ? [] : [{ n, picks: [...q.picks], closed: q.closed }];
  });
}

/** The first probe not yet closed — the one `/items` hands out and `/answers` accepts. */
export function currentProbe(draw: DealtProbe[], states: ProbeState[]): DealtProbe | undefined {
  const closed = new Set(states.filter((s) => s.closed).map((s) => s.n));
  return draw.find((p) => !closed.has(p.n));
}

/**
 * How each closed probe went on its first answer, in order — what the runner draws its pips
 * from after a reload. Nothing in it the student was not already shown when the probe closed.
 */
export function closedResults(
  draw: DealtProbe[],
  states: ProbeState[],
): Array<{ n: number; correct: boolean }> {
  const byN = new Map(states.map((s) => [s.n, s]));
  return draw.flatMap((p) => {
    const s = byN.get(p.n);
    return s?.closed ? [{ n: p.n, correct: s.picks[0] === p.wordId }] : [];
  });
}

export { probeQuestionId };

/**
 * The student's history of the contrasts this set trains, from their own scored sittings of
 * any `minimal_pairs` exercise (plan 72 §3.11). `undefined` with no history at all, which the
 * sampler reads as `balanced` — DECISIONS §3: «on a first sitting it falls back to balanced».
 */
export function historyFor(ex: MinimalPairsContent, details: readonly unknown[]): History | undefined {
  const records = details.flatMap((d) =>
    typeof d === 'object' && d !== null ? readProbeRecords((d as { probes?: unknown }).probes) : [],
  );
  if (records.length === 0) return undefined;

  const merged: History = {};
  for (const contrastId of contrastsInSet(ex)) {
    for (const [word, h] of Object.entries(historyFrom(records, contrastId))) {
      const was = merged[word] ?? { played: 0, missed: 0 };
      merged[word] = { played: was.played + h.played, missed: was.missed + h.missed };
    }
  }
  return merged;
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
