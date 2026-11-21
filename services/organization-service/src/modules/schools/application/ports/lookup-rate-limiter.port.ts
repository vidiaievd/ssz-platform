/** Address lookups per asker per window (plan 90, session 16 remark 4). Counted per asker, never per address. */
export interface ILookupRateLimiter {
  consume(askerId: string): Promise<{ allowed: boolean; retryAfterMs: number }>;
}

export const LOOKUP_RATE_LIMITER = Symbol('LOOKUP_RATE_LIMITER');
