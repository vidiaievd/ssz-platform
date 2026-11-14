import { randomUUID } from 'node:crypto';
import type { AdminLevel } from '@ssz/contracts';

/** The platform admin behind a change, as the admin-panel token names them. */
export interface AdminActor {
  userId: string;
  level: AdminLevel;
}

/**
 * Everything an admin can change here and put on the trail (plan 90, phase 3). Before/after per action:
 * - `payer_policy.changed` — `{ aiEnabled, allowedRegions }` both sides; before absent = nothing was stored
 *   (the default — on, any region — applied).
 * - `binding.changed` (plan 90, phase 7, step 1) — the binding's settings and `version` both sides; before
 *   absent = the write created the binding. Target `capability/<code>`.
 * - `provider.toggled` (plan 90, phase 7, step 7) — `{ code, enabled }` both sides. Target `provider/<id>`.
 * - `model.status_changed` (step 7) — `{ providerCode, providerModelId, status }` both sides. Target `model/<id>`.
 * - `breaker.reset` (step 8) — before `{ providerCode, providerModelId, state, reopensInMs, recentFailures }`, after
 *   `{ providerCode, providerModelId, state: 'closed', recentFailures: 0 }`. Target `model/<id>`.
 * - `model.tested` (step 9) — not a change: no before; after `{ providerCode, providerModelId, outcome, errorCode,
 *   latencyMs, callId }` (`callId` = the `ai_calls` row). The reason is optional here, so it may be empty.
 */
export type AiAdminAction =
  | 'payer_policy.changed'
  | 'binding.changed'
  | 'provider.toggled'
  | 'model.status_changed'
  | 'breaker.reset'
  | 'model.tested';

/**
 * A payer by its id (`workspace/<schoolId>`, `user/<userId>`), an agent by its code (`capability/review_draft`),
 * or a registry row by its id (`provider/<uuid>`, `model/<uuid>`).
 */
export type AdminAuditTargetType = 'workspace' | 'user' | 'capability' | 'provider' | 'model';

/** One row of `admin_audit`; its id is also the `eventId` of the `admin.action.performed` it sends. */
export interface AdminAuditEntry {
  id: string;
  occurredAt: Date;
  actor: AdminActor;
  action: AiAdminAction;
  targetType: AdminAuditTargetType;
  targetId: string;
  /** Empty only for an action that is not a change (`model.tested`) and was given no reason. */
  reason: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

export function adminAuditEntry(input: {
  actor: AdminActor;
  action: AiAdminAction;
  targetType: AdminAuditTargetType;
  targetId: string;
  reason: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  now: Date;
}): AdminAuditEntry {
  return {
    id: randomUUID(),
    occurredAt: input.now,
    actor: input.actor,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    reason: input.reason.trim(),
    before: input.before ?? null,
    after: input.after ?? null,
  };
}

/** Puts one entry on the trail on its own — for a change whose store is not the database (the breaker). */
export interface IAdminAuditRecorder {
  record(entry: AdminAuditEntry): Promise<void>;
}

export const ADMIN_AUDIT_RECORDER = Symbol('ADMIN_AUDIT_RECORDER');
