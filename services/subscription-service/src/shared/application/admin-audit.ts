import { randomUUID } from 'node:crypto';
import type { AdminLevel } from '@ssz/contracts';

/** The platform admin behind a change, as the admin-panel token names them. */
export interface AdminActor {
  userId: string;
  level: AdminLevel;
}

/**
 * Everything an admin can change here. Before/after per action:
 * - `subscription.assigned` — before: the current subscription (absent = the audience's free plan), after: the new one;
 * - `subscription.canceled` — before: the canceled subscription; no after (back to the free plan);
 * - `grant.issued` — after: the grant;
 * - `grant.revoked` — before: the grant, after: `{ grantId, revokedAt }`;
 * - `plan.created` — after: `{ name, audience, version, features }`;
 * - `plan.renamed` — `{ name }` both sides;
 * - `plan.revised` — `{ version, features }` both sides;
 * - `plan.archived` — `{ status }` both sides.
 */
export type SubscriptionAdminAction =
  | 'subscription.assigned'
  | 'subscription.canceled'
  | 'grant.issued'
  | 'grant.revoked'
  | 'plan.created'
  | 'plan.renamed'
  | 'plan.revised'
  | 'plan.archived';

/** A billing account by its payer (`workspace/<schoolId>`, `user/<userId>`), or a plan by its code. */
export type AdminAuditTargetType = 'workspace' | 'user' | 'plan';

/** One row of `admin_audit`; its id is also the `eventId` of the `admin.action.performed` it sends. */
export interface AdminAuditEntry {
  id: string;
  occurredAt: Date;
  actor: AdminActor;
  action: SubscriptionAdminAction;
  targetType: AdminAuditTargetType;
  targetId: string;
  reason: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

export function adminAuditEntry(input: {
  actor: AdminActor;
  action: SubscriptionAdminAction;
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
