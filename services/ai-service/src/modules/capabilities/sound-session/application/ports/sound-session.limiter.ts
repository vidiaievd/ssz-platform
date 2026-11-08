export const SOUND_SESSION_LIMITER = Symbol('SOUND_SESSION_LIMITER');

export type SessionBeginDecision = { allowed: true } | { allowed: false; retryAfterMs: number };

/**
 * The limits of the pronunciation session (plan 86, step 14.1, §5.5a) — pedagogy and abuse, not
 * price: the payer's pool is the gate's. Fails open, like every limiter here.
 */
export interface ISoundSessionLimiter {
  /** Counts a new session of the learner in the UTC day; refused past the daily limit. */
  begin(userId: string): Promise<SessionBeginDecision>;
  /** Counts a take of the session that reached ai-service, heard or not; false past the take limit. */
  take(sessionId: string): Promise<boolean>;
}
