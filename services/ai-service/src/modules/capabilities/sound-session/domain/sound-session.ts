/**
 * A pronunciation session's take is paid from its own surface (plan 86, step 14.1, Q32): the
 * drill of a reading is `pronunciation_drill`, the «speech therapist» `pronunciation_session`.
 * Both are sold under `ai.practice`; the surface is what the ledger tells them apart by.
 */
export const SOUND_SESSION_SURFACE = 'pronunciation_session';

/**
 * Why a session is not let in, on purpose:
 * - `session_limit` — the learner has begun the day's sessions (`AI_SOUND_SESSION_DAILY_LIMIT`),
 *   or a session has had all the takes ai-service hears for one (`AI_SOUND_SESSION_TAKE_LIMIT`);
 * - `not_available` — the payer may not use `ai.practice` (policy, tariff);
 * - `pool_empty` — the payer's `ai.practice` credits for the period are spent.
 */
export type SoundSessionRefusal = 'session_limit' | 'not_available' | 'pool_empty';

/**
 * What the session may cost the payer, for the warning on its start (§5.5a): the session is not
 * blocked by it — a learner whose credits run out mid-session keeps what was measured.
 *
 * `planFree` of §5.5a is not here: ai-service knows a payer's credits, not its plan's code. The
 * client reads that from `subscriptions/me`, which it already does for `useCan()`.
 */
export interface SoundSessionBudget {
  /** Who pays: the school, or the learner under their own plan. */
  payer: 'school' | 'learner';
  /** False — the payer's `ai.practice` has no monthly allowance; nothing to warn about. */
  metered: boolean;
  /** Credits left this period, six decimals; null when unmetered, or when the counter could not be read. */
  remainingCredits: string | null;
  /** What one session is expected to cost (10 takes and their explanations), six decimals. */
  estimatedCredits: string;
  /** When the allowance renews; null when unmetered. */
  periodEnd: string | null;
}

export type AdmitSoundSessionOutcome =
  | { status: 'admitted'; budget: SoundSessionBudget }
  | { status: 'refused'; reason: SoundSessionRefusal; retryAfterMs: number | null }
  /** The gate could not read the payer's policy or tariff. */
  | { status: 'failed'; errorCode: 'gate_unavailable' };
