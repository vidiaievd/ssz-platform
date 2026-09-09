import type { ReviewLock } from '../../domain/entities/attempt.entity.js';

/**
 * The marker standing on a submission after a claim or a release.
 *
 * Both routes answer in the same shape, because both answer the same question the screen
 * actually asks: *who has this open?* `mine: false` with a lock in hand is the colleague
 * case — advisory, so the screen names them and carries on rather than locking the
 * reviewer out (plan 44 §44.8).
 */
export interface ReviewLockResult {
  lock: ReviewLock | null;
  mine: boolean;
}
