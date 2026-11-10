import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import { recordAdminAction } from '../../../infrastructure/audit/record-admin-action.js';
import { outboxRowOf } from '../../../infrastructure/messaging/outbox-event-publisher.service.js';
import type { AdminAuditEntry } from '../../../shared/application/admin-audit.js';
import type { IDomainEvent } from '../../../shared/domain/domain-event.interface.js';
import type { ISchoolLifecycleRepository } from '../domain/school-lifecycle.repository.js';
import { isActiveStatus, type SchoolLifecycleState, type SchoolStatusChange } from '../domain/school-lifecycle.js';

const SELECT = {
  id: true,
  ownerId: true,
  name: true,
  kind: true,
  status: true,
  statusChangedAt: true,
  closesAt: true,
  purgeAt: true,
  statusReason: true,
  deletedAt: true,
} as const;

/**
 * The only writer of `status`, `status_changed_at`, `closes_at`, `purge_at`, `status_reason` and their
 * mirrors `isActive` / `deletedAt` (the aggregate's save leaves them alone).
 */
@Injectable()
export class SchoolLifecyclePrismaRepository implements ISchoolLifecycleRepository {
  constructor(private readonly prisma: PrismaService) {}

  async find(schoolId: string): Promise<SchoolLifecycleState | null> {
    const row = await this.prisma.school.findUnique({ where: { id: schoolId }, select: SELECT });
    if (!row) return null;
    return {
      schoolId: row.id,
      ownerId: row.ownerId,
      name: row.name,
      kind: row.kind,
      status: row.status,
      statusChangedAt: row.statusChangedAt,
      closesAt: row.closesAt,
      purgeAt: row.purgeAt,
      statusReason: row.statusReason,
      deletedAt: row.deletedAt,
    };
  }

  async apply(change: SchoolStatusChange, events: IDomainEvent[], audit: AdminAuditEntry | null): Promise<boolean> {
    const { before, after } = change;
    const rows = events.map((event) => {
      const row = outboxRowOf(event);
      // A lifecycle event without a routing key would be lost silently after the commit.
      if (!row) throw new Error(`No routing key for event type "${event.eventType}"`);
      return row;
    });

    return this.prisma.$transaction(async (tx) => {
      // Compare-and-set on what the move was decided from: a second admin (or the timer) acting on
      // the same school at the same moment finds it moved and gets a conflict, not a double move.
      const { count } = await tx.school.updateMany({
        where: { id: after.schoolId, status: before.status, purgeAt: before.purgeAt },
        data: {
          status: after.status,
          statusChangedAt: after.statusChangedAt,
          closesAt: after.closesAt,
          purgeAt: after.purgeAt,
          statusReason: after.statusReason,
          isActive: isActiveStatus(after.status),
          deletedAt: after.deletedAt,
          updatedAt: change.at,
        },
      });
      if (count === 0) return false;

      for (const row of rows) await tx.outbox.create({ data: row });
      if (audit) await recordAdminAction(tx, audit);
      return true;
    });
  }
}
