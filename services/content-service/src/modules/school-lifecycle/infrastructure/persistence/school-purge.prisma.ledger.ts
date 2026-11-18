import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type {
  ISchoolPurgeLedger,
  PendingSchoolPurge,
} from '../../application/ports/school-purge.ledger.port.js';

const ERROR_LENGTH = 2000;

/** `school_purges` (plan 90, phase 5, step 4c). */
@Injectable()
export class SchoolPurgePrismaLedger implements ISchoolPurgeLedger {
  constructor(private readonly prisma: PrismaService) {}

  async started(schoolId: string, schoolName: string, at: Date): Promise<void> {
    const name = schoolName.slice(0, 200);
    await this.prisma.schoolPurge.upsert({
      where: { schoolId },
      create: { schoolId, schoolName: name, requestedAt: at, lastAttemptAt: at, attempts: 1 },
      // A redelivered event may carry no name; the first one's is kept then.
      update: {
        lastAttemptAt: at,
        attempts: { increment: 1 },
        ...(name ? { schoolName: name } : {}),
      },
    });
  }

  async completed(schoolId: string, at: Date): Promise<void> {
    await this.prisma.schoolPurge.update({
      where: { schoolId },
      data: { completedAt: at, lastError: null },
    });
  }

  async failed(schoolId: string, error: string): Promise<void> {
    await this.prisma.schoolPurge.update({
      where: { schoolId },
      data: { lastError: error.slice(0, ERROR_LENGTH) },
    });
  }

  async findStalled(attemptedBefore: Date, limit: number): Promise<PendingSchoolPurge[]> {
    return this.prisma.schoolPurge.findMany({
      where: { completedAt: null, lastAttemptAt: { lt: attemptedBefore } },
      orderBy: { lastAttemptAt: 'asc' },
      take: limit,
      select: { schoolId: true, schoolName: true, attempts: true },
    });
  }
}
