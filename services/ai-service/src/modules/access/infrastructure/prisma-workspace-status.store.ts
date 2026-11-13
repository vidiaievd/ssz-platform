import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import type { IWorkspaceStatusStore } from '../application/ports/workspace-status.js';
import { WORKSPACE_STATUSES, type WorkspaceStatus } from '../domain/workspace-status.js';

@Injectable()
export class PrismaWorkspaceStatusStore implements IWorkspaceStatusStore {
  constructor(private readonly prisma: PrismaService) {}

  async get(schoolId: string): Promise<WorkspaceStatus> {
    const row = await this.prisma.payerWorkspaceStatus.findUnique({ where: { schoolId } });
    if (!row) return 'active';
    // A value this code does not know is treated as not active: fail closed.
    return (WORKSPACE_STATUSES as readonly string[]).includes(row.status) ? (row.status as WorkspaceStatus) : 'closed';
  }

  /** A guarded update, then an insert that yields to a row already there — two events cannot undo each other. */
  async save(schoolId: string, status: WorkspaceStatus, at: Date): Promise<boolean> {
    const receivedAt = new Date();
    const updated = await this.prisma.payerWorkspaceStatus.updateMany({
      where: { schoolId, changedAt: { lte: at } },
      data: { status, changedAt: at, receivedAt },
    });
    if (updated.count > 0) return true;
    const inserted = await this.prisma.payerWorkspaceStatus.createMany({
      data: [{ schoolId, status, changedAt: at, receivedAt }],
      skipDuplicates: true,
    });
    return inserted.count > 0;
  }
}
