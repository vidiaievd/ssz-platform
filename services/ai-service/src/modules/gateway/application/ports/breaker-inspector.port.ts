/** The breaker's tuning, as the environment set it (`AI_BREAKER_*`). */
export interface BreakerSettings {
  /** Retryable failures within `windowMs` that open the breaker. */
  failures: number;
  windowMs: number;
  /** How long a breaker opened by the count stays open. */
  openMs: number;
  /** Longest a provider's Retry-After may hold a model out. */
  maxRetryAfterMs: number;
}

/**
 * One model's breaker as the store holds it now. `unknown` = the store could not be read —
 * never shown as `closed`, the admin must not take a guess for a fact.
 */
export type BreakerState =
  | { state: 'open'; reopensInMs: number; recentFailures: number }
  | { state: 'closed'; reopensInMs: null; recentFailures: number }
  | { state: 'unknown'; reopensInMs: null; recentFailures: null };

export class BreakerStoreUnavailableError extends Error {
  constructor(message = 'Breaker store is not available') {
    super(message);
    this.name = 'BreakerStoreUnavailableError';
  }
}

/**
 * The admin's view of the per-model breaker (plan 90, phase 7, step 8): read every breaker at
 * once and close one by hand. Separate from `ICircuitBreaker`, which the router uses and which
 * fails open; here a store outage is an answer (`unknown`, or an error on reset), not a "closed".
 */
export interface IBreakerInspector {
  settings(): BreakerSettings;
  /** One entry per key, in the order asked. */
  inspect(keys: string[]): Promise<Map<string, BreakerState>>;
  /** Closes the breaker and clears its failure count. Throws `BreakerStoreUnavailableError`. */
  reset(key: string): Promise<void>;
}

export const BREAKER_INSPECTOR = Symbol('BREAKER_INSPECTOR');
