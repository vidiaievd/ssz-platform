export const SRS_LIMITS_POLICY = Symbol('ISrsLimitsPolicy');

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
}
