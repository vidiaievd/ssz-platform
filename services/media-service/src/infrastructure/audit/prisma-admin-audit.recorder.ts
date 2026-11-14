import { Injectable } from '@nestjs/common';
import type { AdminAuditEntry, IAdminAuditRecorder } from '../../shared/application/admin-audit.js';
import { PrismaService } from '../database/prisma.service.js';
import { recordAdminAction } from './record-admin-action.js';

/** The trail row and its outbox event in a transaction of their own. */
@Injectable()
export class PrismaAdminAuditRecorder implements IAdminAuditRecorder {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AdminAuditEntry): Promise<void> {
    await this.prisma.$transaction((tx) => recordAdminAction(tx, entry));
  }
}
