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
} from '@ssz/shared-kernel/minimal-pairs';

/**
 * Where a `minimal_pairs` sitting meets the attempt (plan 72 §3.6): the draw stored on it and
 * the picks recorded in its `picked_options` under `p<n>`. Pure, and read through the two
 * fields it needs rather than the entity, so VoxOrd can copy it with the submit facts
 * (`scripts/sync-engine-port.mjs`). The random draw and the signed links stay in
 * `minimal-pairs-sitting.ts`, which re-exports all of this.
 */

/** The fields of an attempt a sitting is read from; the `Attempt` entity has both. */
export interface SittingFacts {
  probeDraw: unknown;
  pickedOptions: ReadonlyArray<{ questionId: string; picks: readonly string[]; closed: boolean }>;
}

/** The draw stored on the attempt; empty for an attempt that drew nothing. */
export function drawOf(attempt: SittingFacts): DealtProbe[] {
  return readDraw(attempt.probeDraw);
}

/** Each probe's picks as the kernel's judge reads them, from the attempt's own record. */
export function probeStatesOf(attempt: SittingFacts): ProbeState[] {
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
 * How many of the learner's latest sittings `weakest` reads — enough to see a pattern, bounded.
 * The phone that deals offline keeps to the same number (VoxOrd offline plan, B6).
 */
export const HISTORY_SITTINGS = 50;

/**
 * The student's history of the contrasts this set trains, from their own scored sittings of
 * any `minimal_pairs` exercise (plan 72 §3.11). `undefined` with no history at all, which the
 * sampler reads as `balanced` — DECISIONS §3: «on a first sitting it falls back to balanced».
 */
export function historyFor(
  ex: MinimalPairsContent,
  details: readonly unknown[],
): History | undefined {
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
