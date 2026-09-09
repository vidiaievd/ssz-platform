import type { DerivedProfile } from '@ssz/shared-kernel/skills';

export const EXERCISE_AXES = Symbol('EXERCISE_AXES');

/**
 * Which document to read the axes off (plan 55, decision Q5).
 *
 * `live` is what a learner is being served and what an attempt is graded against;
 * `draft` is the unreleased edit. They differ only while an author has saved something
 * unpublished — and that difference is itself a number the coverage report has to be able
 * to name, which is why the caller says which one it means instead of getting whichever
 * happens to be newer.
 */
export type AxesScope = 'live' | 'draft';

/**
 * What an exercise trains, resolved against the catalogue.
 *
 * A port rather than a class the handlers import directly, for the ordinary reason and
 * one specific one: the implementation reaches for Prisma, and a query handler that
 * imported it by value would drag the generated client into every unit test that never
 * touches a database.
 */
export interface IExerciseAxes {
  /** Null when there is no such exercise. */
  forExercise(exerciseId: string, scope?: AxesScope): Promise<DerivedProfile | null>;

  /** Keyed by exercise id. Ids that resolve to nothing are simply absent. */
  forExercises(
    exerciseIds: readonly string[],
    scope?: AxesScope,
  ): Promise<Map<string, DerivedProfile>>;
}
