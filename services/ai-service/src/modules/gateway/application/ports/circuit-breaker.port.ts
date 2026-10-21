/**
 * Per-model breaker: after repeated retryable failures the router stops trying a model for
 * a while and goes straight to the fallback, instead of paying a timeout on every call.
 *
 * Implementations fail open: if the breaker's own store is away, every model counts as
 * closed — a Redis outage must not take the AI down with it.
 */
export interface ICircuitBreaker {
  isOpen(key: string): Promise<boolean>;
  /** `retryAfterMs` — the provider said when to come back; the breaker opens until then. */
  recordFailure(key: string, retryAfterMs?: number): Promise<void>;
  recordSuccess(key: string): Promise<void>;
}

export const CIRCUIT_BREAKER = Symbol('CIRCUIT_BREAKER');
