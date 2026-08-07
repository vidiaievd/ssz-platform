import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import type { AuditEntry, IAuditLog } from '../../shared/application/ports/audit-log.port.js';

@Injectable()
export class PrismaAuditLog implements IAuditLog {
  private readonly logger = new Logger(PrismaAuditLog.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.contentAuditLog.create({
        data: {
          entityType: entry.entityType,
          entityId: entry.entityId,
          action: entry.action,
          actorUserId: entry.actorUserId,
          changedFields: entry.changedFields ?? [],
        },
      });
    } catch (error) {
      // Swallowed on purpose — see the port. The change the entry describes has
      // already happened and is the thing the author cares about; failing their
      // save to report that the history could not be written would be worse than
      // the gap. Logged loudly so the gap is not silent to us.
      this.logger.error(
        `Failed to record audit entry ${entry.action} on ${entry.entityType} ${entry.entityId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
