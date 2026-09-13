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
   * Resolves the atoms named by a set of targets, skipping the ones that no longer exist.
   * A target whose atom is missing from the answer is broken — retired, or never there.
   */
  describeAtoms(refs: Array<{ atomType: string; atomId: string }>): Promise<AtomDescriptor[]>;
}
