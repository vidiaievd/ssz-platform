import type { DraftWriteMeta, ReviewSubjectResult } from '../../../review-draft/application/ports/review-attempts.client.js';
import type { DirectReview } from '../../domain/direct-review.js';

export const DIRECT_REVIEW_ATTEMPTS_CLIENT = Symbol('IDirectReviewAttemptsClient');

/** One write of a learner's review: the review with its verdict, or the record that the model call failed. */
export type ReviewToWrite = ({ status: 'ready' } & DirectReview) | { status: 'failed'; errorCode: string };

/** Why ai-service gives up on a learner's work (engine step 2.2a). */
export type GiveUpReason = 'refused' | 'unaskable' | 'failed';

/**
 * The learner's side of the work, in exercise-engine (plan 79, steps 2.1b, 2.2a): what to
 * review, where the verdict closes the attempt, and where ai-service gives up on it.
 */
export interface IDirectReviewAttemptsClient {
  /** The subject under `review_direct`. Null when the attempt is unknown. Throws when the engine cannot answer now. */
  getSubject(attemptId: string): Promise<ReviewSubjectResult | null>;
  /**
   * `written` with where the attempt now stands, or `refused` with the engine's code.
   * Throws when the engine cannot answer now — a 409 or 503 included, the two worth a retry.
   */
  putReview(
    attemptId: string,
    review: ReviewToWrite,
    meta: DraftWriteMeta,
  ): Promise<{ written: true; attemptStatus: string } | { written: false; code: string }>;
  /** `closed` as `NO_REVIEWER`, or `refused` with the engine's code. Throws when the engine cannot answer now. */
  giveUp(
    attemptId: string,
    reason: GiveUpReason,
    aiCallId: string | null,
  ): Promise<{ closed: true } | { closed: false; code: string }>;
}
