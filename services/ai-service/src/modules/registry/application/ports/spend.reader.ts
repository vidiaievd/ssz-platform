import type { SpendRow } from '../../domain/platform-spend.js';

/** The call ledger, grouped for the platform's spend. */
export interface ISpendReader {
  /**
   * Calls a model answered or was tried on in [start, end), grouped by UTC day, model, provider,
   * capability and currency. Calls that reached no model (refused by the gate) are left out.
   */
  rows(start: Date, end: Date): Promise<SpendRow[]>;
}

export const SPEND_READER = Symbol('SPEND_READER');
