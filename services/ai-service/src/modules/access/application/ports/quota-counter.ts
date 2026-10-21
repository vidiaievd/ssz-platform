import type { QuotaKey } from '../../domain/quota.js';

/**
 * Credits spent per (payer, agent, period), in micro-credits. Fast and approximate; the
 * ledger is the truth. Every method may throw when the store is away — the gate lets the
 * call through then (fails open) and the reconciler catches up.
 */
export interface IQuotaCounter {
  /** The counter, or null when it does not exist (new period, or the store lost it). */
  get(key: QuotaKey): Promise<bigint | null>;
  /**
   * Starts a missing counter at `spent` (read from the ledger) and returns its value; a
   * counter another instance started meanwhile wins and is returned instead.
   */
  init(key: QuotaKey, spent: bigint): Promise<bigint>;
  /**
   * Adds to an existing counter only. A missing one is left missing: it is started from the
   * ledger on the next check, which already holds this call — starting it at this call
   * alone would forget the rest of the period.
   */
  charge(key: QuotaKey, micro: bigint): Promise<void>;
  /** Every live counter, for the reconciler. */
  list(): AsyncIterable<{ key: QuotaKey; value: bigint }>;
  /** Raises a counter to `spent` if it is below; never lowers it (the spool may be ahead of the ledger). */
  raiseTo(key: QuotaKey, spent: bigint): Promise<void>;
  /** One instance at a time: true when this one got the lock. */
  tryLock(name: string, ttlMs: number): Promise<{ release(): Promise<void> } | null>;
}

export const QUOTA_COUNTER = Symbol('QUOTA_COUNTER');
