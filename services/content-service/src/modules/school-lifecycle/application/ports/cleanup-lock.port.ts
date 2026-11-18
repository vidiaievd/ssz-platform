export const CONTENT_CLEANUP_LOCK = Symbol('CONTENT_CLEANUP_LOCK');

/** One cleanup run at a time across content instances (step 4c). */
export interface IContentCleanupLock {
  /** Runs `work` under the lock; `false` without running it when another run holds the lock. */
  run(work: () => Promise<void>): Promise<boolean>;
}
