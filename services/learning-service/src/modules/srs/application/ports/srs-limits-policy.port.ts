export const SRS_LIMITS_POLICY = Symbol('ISrsLimitsPolicy');

/** Which of the two daily caps a refusal came from. */
export type SrsLimitKind = 'new' | 'review';

export interface ISrsLimitsPolicy {
  /**
   * Returns true if the user has not yet hit the daily new-card cap.
   * Daily cap is read from SRS_DAILY_NEW_CARDS_LIMIT env var.
   * Expiry: midnight UTC (MVP simplification — documented in RedisSrsLimitsPolicy).
   */
  canIntroduceNewCard(userId: string, today: Date): Promise<boolean>;

  /**
   * Returns true if the user has not yet hit the daily review cap.
   * Daily cap is read from SRS_DAILY_REVIEWS_LIMIT env var.
   */
  canReview(userId: string, today: Date): Promise<boolean>;

  /** Atomically increment the new-card counter for today. */
  incrementNewCardCount(userId: string, today: Date): Promise<void>;

  /** Atomically increment the review counter for today. */
  incrementReviewCount(userId: string, today: Date): Promise<void>;

  /**
   * Count one refusal by a daily cap (plan 37 §A.1).
   *
   * Kept next to the counters it mirrors so "how many got through" and "how many did
   * not" share a day boundary and a TTL — comparing them is the whole point.
   */
  recordRefusal(userId: string, kind: SrsLimitKind, today: Date): Promise<void>;

  /** Current review count for today (for the /due envelope). */
  getReviewedCount(userId: string, today: Date): Promise<number>;

  /** Configured daily review cap. */
  getDailyReviewLimit(): number;
}
