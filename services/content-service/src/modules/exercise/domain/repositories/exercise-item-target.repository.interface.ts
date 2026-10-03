import { ExerciseItemTarget } from '../entities/exercise-item-target.entity.js';

export const EXERCISE_ITEM_TARGET_REPOSITORY = Symbol('EXERCISE_ITEM_TARGET_REPOSITORY');

/** A living atom, as much of it as a target needs to be readable. */
export interface AtomDescriptor {
  atomType: string;
  atomId: string;
  title: string;
  /** Which SRS track it is scored on; only grammar atoms carry one today. */
  track: string | null;
  /** The rule an atom belongs to, for grouping in the editor. Null for a word. */
  parentId: string | null;
}

/** Words and grammar atoms an exercise is already linked to, before anything is addressed. */
export interface CandidateAtoms {
  /** Living vocabulary items the exercise is recorded as practising, with their word. */
  words: Array<{ atomId: string; word: string }>;
  /** Living atoms of every rule the exercise is recorded as practising. */
  grammarAtoms: Array<{ atomId: string; title: string; ruleId: string; track: string }>;
  /** Rules linked to the exercise that have no atoms cut yet — nothing to suggest from. */
  rulesWithoutAtoms: Array<{ ruleId: string; title: string }>;
}

export interface IExerciseItemTargetRepository {
  findByExerciseId(exerciseId: string): Promise<ExerciseItemTarget[]>;

  /**
   * Replaces every target of one item in a single transaction — the editing gesture is
   * "this gap is about these atoms", not "add one target". A partial write would leave an
   * item half-addressed if the second call never came.
   */
  replaceForItem(
    exerciseId: string,
    itemKey: string | null,
    targets: ExerciseItemTarget[],
  ): Promise<void>;

  /**
   * The atoms this exercise is already known to practise, from relations the seed and the
   * authoring panel have been writing all along — `vocabulary_item PRACTICED_BY exercise`
   * and `grammar_rule PRACTICED_BY exercise`, plus the rule's exercise pool.
   *
   * This is why the catalogue does not have to be addressed by hand: the exercise level is
   * already known for roughly half of it, and what phase 1 adds is *which piece* of the
   * exercise each of those atoms belongs to.
   */
  findCandidateAtoms(exerciseId: string): Promise<CandidateAtoms>;

  /**
   * Resolves the atoms named by a set of targets, skipping the ones that no longer exist.
   * A target whose atom is missing from the answer is broken — retired, or never there.
   */
  describeAtoms(refs: Array<{ atomType: string; atomId: string }>): Promise<AtomDescriptor[]>;
}
