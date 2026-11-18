import { ADMIN_EVENT_TYPES, type AdminActionPerformedEvent, type AdminActionPerformedPayload } from '@ssz/contracts';
import type { AdminAuditEntry } from '../../shared/application/admin-audit.js';

/** The event that carries an `admin_audit` row to analytics; absent values are left out, not sent as null. */
export function toAdminActionPerformedEvent(entry: AdminAuditEntry): AdminActionPerformedEvent {
  const payload: AdminActionPerformedPayload = {
    service: 'subscription',
    actorId: entry.actor.userId,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    reason: entry.reason,
  };
  // `system` is not an admin level: the contract's `actorLevel` stays absent for it.
  if (entry.actor.level !== 'system') payload.actorLevel = entry.actor.level;
  if (entry.before) payload.before = entry.before;
  if (entry.after) payload.after = entry.after;
  return {
    eventId: entry.id,
    eventType: ADMIN_EVENT_TYPES.ACTION_PERFORMED,
    eventVersion: '1.0',
    occurredAt: entry.occurredAt.toISOString(),
    source: 'subscription-service',
    payload,
  };
}
