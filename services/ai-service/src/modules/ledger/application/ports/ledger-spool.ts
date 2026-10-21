import type { AiCallRecord } from '../../domain/ai-call.js';

/** One spooled entry; `record` is null when the stored text no longer reads as a record. */
export interface SpooledEntry {
  raw: string;
  record: AiCallRecord | null;
}

/**
 * Where a ledger row waits while the database is away (plan 77, step 8a). Shared by every
 * instance, oldest first.
 */
export interface ILedgerSpool {
  /** Appends the record; throws when the spool itself is unavailable. */
  push(record: AiCallRecord): Promise<void>;

  /**
   * Hands up to `limit` of the oldest entries to `consume`, which returns how many of them
   * (counted from the oldest) are done and may be removed. Runs under a lock shared by all
   * instances, so two never consume the same entries. Returns the number removed, or null
   * when the spool is unavailable or another instance holds the lock.
   */
  drain(limit: number, consume: (entries: SpooledEntry[]) => Promise<number>): Promise<number | null>;

  /** Parks an entry no write will ever accept, for a person to look at. */
  deadLetter(raw: string): Promise<void>;
}

export const LEDGER_SPOOL = Symbol('LEDGER_SPOOL');
