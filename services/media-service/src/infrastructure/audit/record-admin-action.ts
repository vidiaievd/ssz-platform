import { randomUUID } from 'node:crypto';
import { EXCHANGES } from '@ssz/contracts';
import type { Prisma } from '../../../generated/prisma/client.js';
import type { AdminAuditEntry } from '../../shared/application/admin-audit.js';
import { toAdminActionPerformedEvent } from './admin-action.event.js';

/**
 * Writes the `admin_audit` row and its `admin.action.performed` outbox row inside the caller's
 * transaction — the trail and its event commit or roll back together.
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
      // Absent → the column stays NULL (a report is plain numbers and booleans).
      before: (entry.before ?? undefined) as object | undefined,
      after: (entry.after ?? undefined) as object | undefined,
    },
  });
  await tx.outbox.create({
    data: {
      id: randomUUID(),
      eventId: event.eventId,
      eventType: event.eventType,
      exchange: EXCHANGES.MEDIA!,
      routingKey: event.eventType,
      payload: JSON.stringify(event),
      correlationId: null,
      occurredAt: entry.occurredAt,
    },
  });
}
