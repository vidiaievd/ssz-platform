/** How many rows each erase removed, for the log; zeros on a replay. */
export interface ErasedLearnerData {
  lessonScores: number;
  memberships: number;
}

export interface IDeletedUserEraser {
  /**
   * Hard-deletes what this service keeps about one learner — exam scores and the school
   * membership projection — in one transaction. Idempotent.
   */
  erase(userId: string): Promise<ErasedLearnerData>;
}

export const DELETED_USER_ERASER = Symbol('DELETED_USER_ERASER');
