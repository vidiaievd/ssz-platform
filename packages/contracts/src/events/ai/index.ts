import type { BaseEvent } from '../base.js';

// ─── Event type constants ─────────────────────────────────────────────────────

export const AI_EVENT_TYPES = {
  CALL_COMPLETED: 'ai.call.completed',
} as const;

// ─── Payload interfaces ───────────────────────────────────────────────────────

/** Who is billed for a call. `platform` — calls nobody is charged for (admin checks). */
export type AiPayerType = 'workspace' | 'user' | 'platform';

/**
 * `refused_*` and `disabled` are calls the gate turned away before any model: they cost
 * nothing and are recorded to show how often an agent was wanted and not given.
 */
export type AiCallOutcome =
  | 'ok'
  | 'invalid_response'
  | 'error'
  | 'refused_quota'
  | 'refused_policy'
  | 'disabled';

/**
 * One gateway call — whatever its outcome — as written to ai-service's ledger. Never carries
 * prompt or answer text. Model fields are null when no model was called.
 */
export interface AiCallCompletedPayload {
  callId: string;
  capability: string;
  payerType: AiPayerType;
  payerId: string;
  actorUserId: string | null;
  actorRole: string | null;
  /** Where the call came from, e.g. `admin_diagnostic`, `admin_model_test`. */
  surface: string;
  providerId: string | null;
  providerCode: string | null;
  modelId: string | null;
  providerModelId: string | null;
  promptVersion: string | null;
  usage: { input: number; output: number; cacheRead: number; cacheWrite: number } | null;
  /** In 1e-6 of `currency`; null when the model has no price in effect. */
  costMicros: number | null;
  currency: string | null;
  /** Decimal string (up to six places): cost × the platform credit rate. */
  credits: string | null;
  latencyMs: number;
  outcome: AiCallOutcome;
  errorCode: string | null;
  fallbackUsed: boolean;
  /** ISO 8601 — when the call started. */
  createdAt: string;
}

// ─── Typed event aliases ──────────────────────────────────────────────────────

export type AiCallCompletedEvent = BaseEvent<AiCallCompletedPayload>;
