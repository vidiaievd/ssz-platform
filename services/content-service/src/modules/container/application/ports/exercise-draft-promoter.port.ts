export const EXERCISE_DRAFT_PROMOTER = Symbol('EXERCISE_DRAFT_PROMOTER');

export interface PromotedDrafts {
  exercises: number;
  instructions: number;
}

/**
 * Releases the unreleased edits of every exercise a version places.
 *
 * Exercise documents have no versions of their own — one row serves every
 * version of every container that places it — so an edit waits in the row's
 * draft columns until a publish moves it across. This is that move, and it is
 * the only thing that performs it: saving never does.
 */
export interface IExerciseDraftPromoter {
  /**
   * Promotes drafts for the exercises the version places directly, and for the
   * exercises its lessons embed (listening stages, video questions) — those are
   * just as much part of what publishing releases, and are reachable only
   * through the lesson that holds them.
   */
  promoteForVersion(versionId: string): Promise<PromotedDrafts>;
}
