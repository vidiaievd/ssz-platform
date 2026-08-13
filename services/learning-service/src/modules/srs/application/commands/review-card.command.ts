import type { ReviewRatingValue } from '../../domain/value-objects/review-rating.vo.js';

export class ReviewCardCommand {
  constructor(
    public readonly userId: string,
    public readonly cardId: string,
    public readonly rating: ReviewRatingValue,
    public readonly reviewedAt?: Date,
    /** Client-generated key that makes a replayed review a no-op. */
    public readonly idempotencyKey?: string,
    /**
     * The learner has been told the day's review quota is met and chose to go on
     * (plan 37 §B.1). Lifts the daily review cap for this submission and nothing else
     * — never the new-card cap, which protects a week the learner cannot see yet.
     */
    public readonly carryOnPastLimit?: boolean,
  ) {}
}
