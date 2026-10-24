import type {
  ExerciseAttemptAiReviewDisputedPayload,
  ExerciseAttemptAiReviewedPayload,
} from '@ssz/contracts';
import type { Attempt } from '../../../attempts/domain/entities/attempt.entity.js';
import type { AttemptAiDraft } from '../entities/attempt-ai-draft.entity.js';

export const ATTEMPT_AI_REVIEWED = 'exercise.attempt.ai_reviewed';
export const ATTEMPT_AI_REVIEW_DISPUTED = 'exercise.attempt.ai_review_disputed';

/**
 * A model's verdict landed on a learner's attempt (plan 79, 2.3b): the count a dispute rate
 * is read against, on the axes the review was written on.
 */
export function aiReviewedPayload(
  attempt: Attempt,
  review: AttemptAiDraft,
  at: Date,
): ExerciseAttemptAiReviewedPayload {
  return {
    attemptId: attempt.id,
    userId: attempt.userId,
    exerciseId: attempt.exerciseId,
    templateCode: attempt.templateCode,
    capability: review.capability,
    modelId: review.modelId,
    promptVersion: review.promptVersion,
    outcome: attempt.status === 'RETURNED' ? 'returned' : 'approved',
    occurredAt: at.toISOString(),
  };
}

/** The learner said that review is wrong — counted on the review's own day. */
export function aiReviewDisputedPayload(
  attempt: Attempt,
  review: AttemptAiDraft,
  withReason: boolean,
  at: Date,
): ExerciseAttemptAiReviewDisputedPayload {
  const { occurredAt: _reviewed, ...axes } = aiReviewedPayload(attempt, review, at);
  return {
    ...axes,
    // Only a delivered verdict makes a review disputable, and a delivery writes this.
    reviewedAt: (attempt.reviewedAt as Date).toISOString(),
    withReason,
    occurredAt: at.toISOString(),
  };
}
