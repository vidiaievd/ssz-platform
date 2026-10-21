import type { SrsTrack } from '../../domain/value-objects/srs-track.js';

export const SRS_LIMITS_POLICY = Symbol('ISrsLimitsPolicy');

/**
 * Which of the two daily caps a refusal came from. Only `review` is produced since
 * plan 37 §C.1 — the new-card cap no longer refuses — and `new` stays so the refusals
 * already recorded keep reading.
 */
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
   * Take one slot of the track's daily new-card budget and say which day it was taken
   * from (plan 37 §C.1): today when today has room, otherwise the first later day that
   * does. Returns the start of that UTC day; the caller makes it the card's first due.
   *
   * Never refuses. The card is introduced because the learner has already done the
   * work — refusing it would only drop the material from the schedule. What the budget
   * still caps is how many new cards come to the learner on any one day.
   *
   * Looks ahead a bounded number of days; past that horizon the last day takes the card
   * over its budget. Caps are read from SRS_DAILY_NEW_CARDS_LIMIT_<TRACK>.
   * Day boundary: midnight UTC (MVP simplification — documented in RedisSrsLimitsPolicy).
   */
  claimNewCardDay(userId: string, track: SrsTrack, now: Date): Promise<Date>;

  /**
   * Returns true if the user has not yet hit the track's daily review cap.
   * Caps are read from SRS_DAILY_REVIEWS_LIMIT_<TRACK>.
   */
  canReview(userId: string, track: SrsTrack, today: Date): Promise<boolean>;

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
