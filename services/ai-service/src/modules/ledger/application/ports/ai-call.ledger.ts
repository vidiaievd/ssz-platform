import type { AiCallRecord } from '../../domain/ai-call.js';

export interface IAiCallLedger {
  /**
   * Writes the row and its `ai.call.completed` event in one transaction.
   *
   * Idempotent by `call.id`: a row already there (an earlier attempt that committed but
   * whose reply was lost, a spooled copy) is a success, not a second row. Throws
   * `LedgerRecordRejected` when the row itself is unacceptable — another attempt cannot
   * help; anything else thrown is a failure worth retrying.
   */
  record(call: AiCallRecord): Promise<void>;
}

export const AI_CALL_LEDGER = Symbol('AI_CALL_LEDGER');

/** The database refused the row's data, not the connection: retrying writes the same refusal. */
export class LedgerRecordRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LedgerRecordRejected';
  }
}
