export const ATOM_FLAG_LOG = Symbol('IAtomFlagLog');

/** Who named the atom — `exercise.feedback.atoms_flagged` `source`. */
export type AtomFlagSource = 'ai_precheck' | 'ai_review' | 'teacher' | 'ai_voice';

/** What became of one flagged atom (plan 85, step 5). */
export type AtomFlagOutcome =
  /** The card's due date was pulled closer. */
  | 'pulled'
  /** The card was already due by then. */
  | 'already_due'
  /** A teacher's mark outside the exercise's targets: rated AGAIN (§1 rule 5). */
  | 'lapsed'
  /** A teacher's mark on one of the exercise's targets: the hand-in rated it already. */
  | 'in_targets'
  /** The learner suspended the card; left alone. */
  | 'suspended'
  /** No card: the rule is offered to the learner on the screen (step 7), or not reached at all. */
  | 'no_card'
  /** A sound flagged again on another day: its shadow card was introduced (plan 86, step 8.3). */
  | 'introduced';

export interface AtomFlagEntry {
  userId: string;
  exerciseId: string;
  attemptId: string;
  atomType: string;
  atomId: string;
  source: AtomFlagSource;
  inExerciseTargets: boolean;
  outcome: AtomFlagOutcome;
  /** UTC day of the signal — the deduplication window (§1 rule 3). */
  flaggedOn: Date;
  schoolId: string | null;
  containerId: string | null;
  groupId: string | null;
}

/** One flag as the drill reads it back (plan 86, step 13.1): which atom, who named it, which day. */
export interface AtomFlagDay {
  atomId: string;
  source: AtomFlagSource;
  flaggedOn: Date;
}

export interface IAtomFlagLog {
  /**
   * Records the flag unless one for the same (learner, exercise, atom, source, day) is there
   * already. `duplicate` means the signal was given today and must change nothing.
   */
  record(entry: AtomFlagEntry): Promise<'recorded' | 'duplicate'>;

  /**
   * The distinct UTC days in `[from, before)` on which the learner had this atom flagged, by
   * any exercise and any source (plan 86, step 8.3) — `before` is today, so a second check
   * the same day does not count as repeating.
   */
  flaggedDays(userId: string, atomType: string, atomId: string, from: Date, before: Date): Promise<number>;

  /**
   * The learner's flags of one atom type since `from` (a UTC day, inclusive), restricted to the
   * atom ids starting with `atomIdPrefix` (`nb:` — one language's sounds). Every row, not only
   * distinct days: the caller folds them per atom (plan 86, step 13.1).
   */
  recentFlags(userId: string, atomType: string, atomIdPrefix: string, from: Date): Promise<AtomFlagDay[]>;
}
