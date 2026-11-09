/** How many rows each erase removed, for the log; zeros on a replay. */
export interface ErasedLearnerData {
  enrollments: number;
  assignments: number;
  progress: number;
  srsCards: number;
  canDo: number;
}

export interface IDeletedUserEraser {
  /**
   * Hard-deletes everything this service keeps about one learner — enrolments, assignments
   * given to them, progress, SRS cards and can-do statements — in one transaction. Idempotent.
   */
  erase(userId: string): Promise<ErasedLearnerData>;
}

export const DELETED_USER_ERASER = Symbol('DELETED_USER_ERASER');
