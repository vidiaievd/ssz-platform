/** How many rows each erase removed, for the log; zeros on a replay. */
export interface ErasedLearnerAttempts {
  attempts: number;
  probes: number;
}

export interface IDeletedUserEraser {
  /**
   * Hard-deletes the learner's attempts — answers, submitted text, teacher reviews and AI
   * drafts with them — and their probe tasks, in one transaction. Idempotent.
   */
  erase(userId: string): Promise<ErasedLearnerAttempts>;
}

export const DELETED_USER_ERASER = Symbol('DELETED_USER_ERASER');
