import { randomUUID } from 'node:crypto';
import {
  ADMIN_EVENT_TYPES,
  EXCHANGES,
  type AdminActionPerformedEvent,
  type AdminActionPerformedPayload,
} from '@ssz/contracts';
import { Prisma } from '../../../generated/prisma/client.js';
import type { AdminAuditEntry } from '../../shared/application/admin-audit.js';

/**
 * Writes the `admin_audit` row and its `admin.action.performed` outbox row inside the caller's
 * transaction — the change, its trail and its event commit or roll back together. Same envelope as
 * subscription-service's (`eventVersion: '1.0'`).
 */
export async function recordAdminAction(tx: Prisma.TransactionClient, entry: AdminAuditEntry): Promise<void> {
  const event = toAdminActionPerformedEvent(entry);
  await tx.adminAudit.create({
    data: {
      id: entry.id,
      occurredAt: entry.occurredAt,
      actorId: entry.actor.userId,
      actorLevel: entry.actor.level,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      reason: entry.reason,
      before: json(entry.before),
      after: json(entry.after),
    },
  });
  await tx.outbox.create({
    data: {
      id: randomUUID(),
      eventId: event.eventId,
      eventType: event.eventType,
      exchange: EXCHANGES.ORGANIZATION!,
      routingKey: event.eventType,
      payload: JSON.stringify(event),
      correlationId: null,
      occurredAt: entry.occurredAt,
    },
  });
}

/** The event that carries an `admin_audit` row to analytics; absent values are left out, not sent as null. */
export function toAdminActionPerformedEvent(entry: AdminAuditEntry): AdminActionPerformedEvent {
  const payload: AdminActionPerformedPayload = {
    service: 'organization',
    actorId: entry.actor.userId,
    actorLevel: entry.actor.level,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    reason: entry.reason,
  };
  if (entry.before) payload.before = entry.before;
  if (entry.after) payload.after = entry.after;
  return {
    eventId: entry.id,
    eventType: ADMIN_EVENT_TYPES.ACTION_PERFORMED,
    eventVersion: '1.0',
    occurredAt: entry.occurredAt.toISOString(),
    source: 'organization-service',
    payload,
  };
}

function json(value: Record<string, unknown> | null): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === null ? Prisma.DbNull : (value as Prisma.InputJsonValue);
}
