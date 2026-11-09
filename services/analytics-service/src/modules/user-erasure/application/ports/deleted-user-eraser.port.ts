/** How many rows each erase touched, for the log; zeros on a replay. */
export interface ErasedLearnerData {
  /** Directory, school and group membership projections. */
  directory: number;
  /** Enrolments, activity, attempt/atom evidence, mastery, SRS refusals, item progress. */
  learning: number;
  /** School feed rows the user was the actor of, and review-term journal rows of their work. */
  schoolRecords: number;
  /** Archived events about the user, deleted. */
  archivedEvents: number;
  /** Archived `ai.call.completed` events kept, actor cleared — as ai-service does its ledger. */
  archivedCallsUnlinked: number;
}

export interface IDeletedUserEraser {
  /**
   * Hard-deletes every per-learner row and every archived event naming the user, in one
   * transaction. Money stays: `ai_usage_daily` and the archived ledger and subscription events
   * it is replayed from. Per-day aggregates without a user stay too. Idempotent.
   */
  erase(userId: string): Promise<ErasedLearnerData>;
}

export const DELETED_USER_ERASER = Symbol('DELETED_USER_ERASER');
