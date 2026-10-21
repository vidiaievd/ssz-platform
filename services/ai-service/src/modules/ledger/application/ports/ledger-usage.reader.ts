import type { Payer } from '../../../access/domain/payer.js';

/** What the ledger says a payer has spent — the truth the quota counter is checked against. */
export interface ILedgerUsageReader {
  /** Sum of `credits` in micro-credits over `[from, to)`; rows without a cost count as zero. */
  microCreditsSpent(payer: Payer, capability: string, from: Date, to: Date): Promise<bigint>;
}

export const LEDGER_USAGE_READER = Symbol('LEDGER_USAGE_READER');
