import type { AiCallRecord } from '../../domain/ai-call.js';

export interface IAiCallLedger {
  /** Writes the row and its `ai.call.completed` event in one transaction. */
  record(call: AiCallRecord): Promise<void>;
}

export const AI_CALL_LEDGER = Symbol('AI_CALL_LEDGER');
