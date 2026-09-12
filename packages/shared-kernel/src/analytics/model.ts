// What a cell of an analytics grid is — plan 58 §2, DATA_MODEL §2.
//
// The rule this module exists for: **a cell may never say "0%" when the truth is "we do
// not know"**. Four of the five kinds of emptiness are more common today than full data
// (no `classwork`, `focus` mostly `unknown`, `listening` zero, most cells under the
// sample threshold), so the empty kinds are not edge cases here — they are the normal
// answer, and each one is a different sentence to a teacher.
//
// The state is decided here rather than at each surface because four endpoints and six
// screens have to agree on it. A grid that computed its own would eventually disagree
// with the chart beside it about the same learner, which is the one thing §5 of the
// data model forbids.

/**
 * Every way a cell can be, in the order of the priority rule below.
 *
 * `low` is not a kind of emptiness: it is the bottom of the measured scale. "Bad" and
 * "very bad" are one quantity, and splitting them would invent a boundary nobody asked
 * for; splitting "bad" from "not measured" is the whole point of the list.
 */
export const CELL_STATES = [
  'ok',
  'low',
  'notStarted',
  'insufficient',
  'notDelivered',
  'unlinked',
  'noContent',
] as const;

export type CellState = (typeof CELL_STATES)[number];

/**
 * Below this the measured value is `low` rather than `ok`.
 *
 * A threshold on the *action*, not on the colour — the colour is continuous either way.
 * **Not calibrated**: it is the point where a teacher is expected to do something, and
 * which point that is, is a question for live data (§4 of the plan).
 */
export const LOW_THRESHOLD = 0.4;

/**
 * Everything a surface knows about one cell before it is named.
 *
 * The fields are optional because the surfaces ask different questions: a unit of a
 * group's plan can be `notDelivered`, a learner's skill×focus cell cannot, and a cell
 * that cannot be in a state must not be able to claim it. `undefined` means "this
 * question does not apply here", which is not the same as `false`.
 */
export interface CellStateInput {
  /** Was the unit taught. `undefined` where nothing is scheduled — learner grids. */
  delivered?: boolean | undefined;
  /** Does the plan unit name a course unit. `undefined` where there is no plan. */
  linked?: boolean | undefined;
  /**
   * How many items of the course stand behind this cell.
   *
   * `0` is `noContent` and it is a statement about the course, not about the learner:
   * the whole `listening` row is `0` today because no clip has been published yet.
   */
  items?: number | undefined;
  /** Attempts that landed in the cell, however thin. `0` is `notStarted`. */
  attempts: number;
  /**
   * How much evidence the cell holds, in the unit the surface counts in: weighted
   * attempts for a learner's cell, **learners who attempted** for a group's unit. The
   * threshold beside it is in the same unit, and both are reported to the screen — a
   * verdict is shown next to the number it was made under (§4.5 of the brief).
   */
  sample: number;
  /** Below this the profile refuses to judge. Comes from configuration, never hardcoded. */
  minSample: number;
  /** The measured value, `0..1`. `null` means nothing was computed — never treat it as `0`. */
  value: number | null;
  /** Overrides `LOW_THRESHOLD` where a surface has its own idea of "act on this". */
  lowThreshold?: number | undefined;
}

/**
 * Name the cell.
 *
 * Priority, highest first (DATA_MODEL §2): `notDelivered` > `unlinked` > `noContent` >
 * `notStarted` > `insufficient` > `low` / `ok`. The order is the order of the teacher's
 * questions: what was never taught cannot be missing content, content that does not
 * exist cannot be unattempted, and an unattempted cell has nothing to be short of.
 *
 * Reading it the other way round — starting from the value — is how "0%" gets printed
 * for a unit nobody has reached yet.
 */
export function cellStateOf(input: CellStateInput): CellState {
  if (input.delivered === false) return 'notDelivered';
  if (input.linked === false) return 'unlinked';
  if (input.items === 0) return 'noContent';
  if (input.attempts === 0) return 'notStarted';
  if (input.sample < input.minSample) return 'insufficient';
  // Measured, cleared the bar, and still no number: nothing was computed, and silence
  // is the honest answer. Falling through to `ok` here would print the zero this whole
  // module exists to prevent.
  if (input.value === null) return 'insufficient';

  return input.value < (input.lowThreshold ?? LOW_THRESHOLD) ? 'low' : 'ok';
}

/**
 * Does this cell carry a number a reader may act on.
 *
 * `low` counts. The chart breaks its line wherever this is false, and a unit the group
 * genuinely did badly at is not a hole in the data — hiding it would turn a real dip
 * into "we never measured this", which is the same confusion as printing a zero, only
 * pointing the other way.
 */
export function isMeasured(state: CellState): boolean {
  return state === 'ok' || state === 'low';
}
