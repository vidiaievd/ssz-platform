import type { ReviewCard, SchedulingResult } from '../../domain/entities/review-card.entity.js';
import type { ReviewRating } from '../../domain/value-objects/review-rating.vo.js';

export const SRS_SCHEDULER = Symbol('ISrsScheduler');

export interface PredictedInterval {
  rating: 'AGAIN' | 'HARD' | 'GOOD' | 'EASY';
  scheduledDays: number;
  label: string;
}

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

  /**
   * Current recall probability (0..1) per the FSRS forgetting curve, given
   * the card's stability and elapsed time since its last review. Used for
   * mastery roll-ups (plan 21 §2.1/§2.2) — NEW cards (never reviewed) have
   * retrievability 0.
   */
  getRetrievability(card: ReviewCard, now: Date): number;

  /**
   * Preview all 4 FSRS rating outcomes for a card at a given time.
   * Returns human-readable labels for the client rating buttons.
   */
  predictIntervals(card: ReviewCard, now: Date): PredictedInterval[];
}
