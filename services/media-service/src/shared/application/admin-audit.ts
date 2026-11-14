import { randomUUID } from 'node:crypto';
import type { AdminLevel } from '@ssz/contracts';

/** The platform admin behind a change, as the admin-panel token names them. */
export interface AdminActor {
  userId: string;
  level: AdminLevel;
}

/**
 * Everything an admin can change in media-service and put on the trail (plan 90, phase 8):
 * - `media.sweep.deleted` (step 4) — a sweep run in delete mode from the panel. No before; after =
 *   the sweep's report plus `runId` (the `sweep_runs` row), or `{ runId, error }` when it threw.
 *   Target `media_sweep/<kind>`. A dry run changes nothing and is not on the trail.
 */
export type MediaAdminAction = 'media.sweep.deleted';

export type AdminAuditTargetType = 'media_sweep';

/** One row of `admin_audit`; its id is also the `eventId` of the `admin.action.performed` it sends. */
export interface AdminAuditEntry {
  id: string;
  occurredAt: Date;
  actor: AdminActor;
  action: MediaAdminAction;
  targetType: AdminAuditTargetType;
  targetId: string;
  reason: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

export function adminAuditEntry(input: {
  actor: AdminActor;
  action: MediaAdminAction;
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

/**
 * Puts one entry on the trail — the row and its outbox event in one transaction. A sweep deletes
 * files and rows over many statements, so its entry follows the run rather than sharing a
 * transaction with it.
 */
export interface IAdminAuditRecorder {
  record(entry: AdminAuditEntry): Promise<void>;
}

export const ADMIN_AUDIT_RECORDER = Symbol('ADMIN_AUDIT_RECORDER');
