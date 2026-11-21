/**
 * How many address lookups one person may make in a window. A lookup tells whether an address has
 * an account, so it is counted per asker, never per address (plan 90, session 16 remark 4).
 */
export interface ILookupRateLimiter {
  /** Counts one lookup; `allowed: false` once the asker is over the limit for the current window. */
  consume(askerId: string): Promise<{ allowed: boolean; retryAfterMs: number }>;
}

export const LOOKUP_RATE_LIMITER = Symbol('LOOKUP_RATE_LIMITER');
