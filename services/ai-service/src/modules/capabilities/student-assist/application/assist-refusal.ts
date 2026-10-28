import type { RefusalCode } from '../../../access/domain/refusal.js';
import type { AdmissionFailure } from '../../../gateway/application/ai-gateway.js';

/** Why the assistant is not there for this payer (§3's 409 `reason`, and `availability`'s). */
export type AssistRefusal = 'no_key' | 'policy' | 'quota' | 'disabled' | 'no_binding';

const REFUSAL_REASON: Record<RefusalCode, AssistRefusal> = {
  ai_disabled: 'policy',
  region_not_allowed: 'policy',
  not_entitled: 'no_key',
  quota_exhausted: 'quota',
};

/**
 * The refusal the learner's client is told; null when the gate could not check — that is an
 * outage of ours, not a no (R-f).
 */
export function assistRefusalOf(failure: AdmissionFailure): AssistRefusal | null {
  if (failure.kind === 'disabled') return failure.binding ? 'disabled' : 'no_binding';
  if (failure.kind === 'refused') return REFUSAL_REASON[failure.code];
  return null;
}
