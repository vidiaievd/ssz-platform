import type { ReviewCard, SchedulingResult } from '../../domain/entities/review-card.entity.js';
import type { ReviewRating } from '../../domain/value-objects/review-rating.vo.js';

export const SRS_SCHEDULER = Symbol('ISrsScheduler');

export interface ISrsScheduler {
  /**
   * Compute the next scheduling state for a card given a user rating.
   * The implementation (FsrsScheduler) applies the FSRS algorithm and then clamps
   * scheduledDays to SRS_MAX_INTERVAL_DAYS before returning.
   */
  schedule(
    card: ReviewCard,
    rating: ReviewRating,
    reviewedAt: Date,
  ): SchedulingResult;
}
