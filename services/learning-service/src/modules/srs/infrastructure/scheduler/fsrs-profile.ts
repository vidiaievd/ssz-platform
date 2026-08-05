/**
 * Frozen FSRS parameter profile.
 *
 * Until now the scheduler constructed `new FSRS({ maximum_interval })` and let
 * ts-fsrs supply every other parameter from its own defaults. That is a silent
 * coupling to the library version: a `ts-fsrs` upgrade that changes the default
 * weights (or the FSRS generation) would silently reschedule every existing
 * card, with no migration and no way to tell before/after values apart.
 *
 * The values below are ts-fsrs 5.4.0's defaults, captured verbatim, so freezing
 * them changes nothing numerically today — it only makes any future change
 * explicit. VoxOrd (mobile) mirrors this file for its offline personal-word
 * scheduling; the two must stay in lockstep, and every persisted card records
 * `profileId` so a mismatch on read is detectable instead of invisible.
 *
 * Changing `w` or `generation` is NOT a config tweak: it is a new `profileId`
 * plus a migration on both sides.
 */
/** Learning/relearning step, e.g. `10m`. Mirrors ts-fsrs's `Steps` element type. */
export type FsrsStep = `${number}m` | `${number}h` | `${number}d`;

export interface FsrsProfile {
  /** Stored on every card; a read-time mismatch means recompute/migrate. */
  readonly id: string;
  /** FSRS algorithm generation. `w.length` is a function of this. */
  readonly generation: 'fsrs-5' | 'fsrs-6';
  readonly w: readonly number[];
  readonly requestRetention: number;
  readonly maximumIntervalDays: number;
  readonly enableShortTerm: boolean;
  readonly enableFuzz: boolean;
  readonly learningSteps: readonly FsrsStep[];
  readonly relearningSteps: readonly FsrsStep[];
}

/**
 * ts-fsrs 5.4.0 defaults. Note this is FSRS-6 (21 weights), not FSRS-5 (19) —
 * verified against `generatorParameters()` of the installed version.
 */
export const SSZ_FSRS_PROFILE: FsrsProfile = {
  id: 'fsrs-6-default-v1',
  generation: 'fsrs-6',
  w: [
    0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722,
    0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425,
    0.0912, 0.0658, 0.1542,
  ],
  requestRetention: 0.9,
  maximumIntervalDays: 365,
  enableShortTerm: true,
  enableFuzz: false,
  learningSteps: ['1m', '10m'],
  relearningSteps: ['10m'],
};
