import type { AiCallOutcome, AiPayerType } from '@ssz/contracts';
import type { LlmUsage } from '../../providers/domain/llm-result.js';

export type { AiCallOutcome, AiPayerType };

/** Who pays and who acted — settled by the caller, never taken from the client. */
export interface CallContext {
  payer: { type: AiPayerType; id: string };
  actor: { userId: string; role: string | null } | null;
  /** Where the call came from: `admin_diagnostic`, `admin_model_test`, an agent's screen. */
  surface: string;
}

/** The model a call reached; null on the record when none was called. */
export interface CalledModel {
  providerId: string;
  providerCode: string;
  modelId: string;
  providerModelId: string;
}

/** One route step, as the router reports it. No text. */
export interface CallAttempt {
  role: 'primary' | 'fallback';
  modelId: string;
  outcome: 'ok' | 'error' | 'skipped';
  reason: string | null;
}

/** One ledger row: everything about a gateway call except its texts. */
export interface AiCallRecord {
  id: string;
  capability: string;
  context: CallContext;
  model: CalledModel | null;
  promptVersion: string | null;
  usage: LlmUsage | null;
  /** Null when the model had no price in effect (or nothing was called — then 0). */
  cost: { micros: number; currency: string } | null;
  /** Decimal string; null when the cost is unknown. */
  credits: string | null;
  latencyMs: number;
  outcome: AiCallOutcome;
  errorCode: string | null;
  fallbackUsed: boolean;
  attempts: CallAttempt[];
  createdAt: Date;
}
