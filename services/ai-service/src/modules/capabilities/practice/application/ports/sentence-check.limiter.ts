export const SENTENCE_CHECK_LIMITER = Symbol('SENTENCE_CHECK_LIMITER');

/** A try at a sentence let through, or how long until the learner's day for it starts over. */
export type SentenceCheckDecision = { allowed: true } | { allowed: false; retryAfterMs: number };

/**
 * Tries per learner per sentence per UTC day (plan 86, step 6g). The sentence drill sits outside
 * the school's per-exercise limit, so this is what stops a learner repeating one sentence for ever.
 * Counts every try that reaches the limiter, heard or not.
 */
export interface ISentenceCheckLimiter {
  take(userId: string, sentence: string): Promise<SentenceCheckDecision>;
}
