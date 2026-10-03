import type { SrsTrack } from '../../domain/value-objects/srs-track.js';

export const SRS_LIMITS_POLICY = Symbol('ISrsLimitsPolicy');

/** Which of the two daily caps a refusal came from. */
export type SrsLimitKind = 'new' | 'review';

/**
 * Every cap is per track since plan 63 phase 6.
 *
 * Two budgets rather than one because the two memories are paid for differently:
 * without the split, a day of vocabulary crowds out every rule that came due, and
 * "twenty cards today" is a number nobody chose. The sum of what can be spent is kept
 * at what one budget used to be — see `configuration.ts`.
 */
export interface ISrsLimitsPolicy {
  /**
   * Returns true if the user has not yet hit the track's daily new-card cap.
   * Caps are read from SRS_DAILY_NEW_CARDS_LIMIT_<TRACK>.
   * Expiry: midnight UTC (MVP simplification — documented in RedisSrsLimitsPolicy).
   */
  canIntroduceNewCard(userId: string, track: SrsTrack, today: Date): Promise<boolean>;

  /**
   * Returns true if the user has not yet hit the track's daily review cap.
   * Caps are read from SRS_DAILY_REVIEWS_LIMIT_<TRACK>.
   */
  canReview(userId: string, track: SrsTrack, today: Date): Promise<boolean>;

  /** Atomically increment the track's new-card counter for today. */
  incrementNewCardCount(userId: string, track: SrsTrack, today: Date): Promise<void>;

  /** Atomically increment the track's review counter for today. */
  incrementReviewCount(userId: string, track: SrsTrack, today: Date): Promise<void>;

  /**
   * Count one refusal by a daily cap (plan 37 §A.1, split by track in plan 63 phase 6).
   *
   * Kept next to the counters it mirrors so "how many got through" and "how many did
   * not" share a day boundary and a TTL — comparing them is the whole point. The track
   * is part of that: once there are two budgets, a refusal that does not say which one
   * refused cannot be read at all.
   */
  recordRefusal(
    userId: string,
    kind: SrsLimitKind,
    track: SrsTrack,
    today: Date,
  ): Promise<void>;

  /**
   * Reviews done today (for the /due envelope) — on one track, or across both when the
   * caller asks about the day as a whole.
   */
  getReviewedCount(userId: string, today: Date, track?: SrsTrack): Promise<number>;

  /** Configured daily review cap for a track, or the sum of both when none is named. */
  getDailyReviewLimit(track?: SrsTrack): number;
}
