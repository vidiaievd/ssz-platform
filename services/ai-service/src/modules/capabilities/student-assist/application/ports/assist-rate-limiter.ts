export const ASSIST_RATE_LIMITER = Symbol('ASSIST_RATE_LIMITER');

/** A learner's turn let through, or how long until the next one is. */
export type AssistRateDecision = { allowed: true } | { allowed: false; retryAfterMs: number };

/**
 * Messages per learner per window (plan 83, step 5), before any payer is resolved: a burst
 * costs neither the readers nor the gate. Counts every message sent, answered or not.
 */
export interface IAssistRateLimiter {
  take(userId: string): Promise<AssistRateDecision>;
}
