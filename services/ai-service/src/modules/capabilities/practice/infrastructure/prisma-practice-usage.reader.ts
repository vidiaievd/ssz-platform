import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { microCredits } from '../../../ledger/domain/credits.js';
import { PRECHECK_SURFACE } from '../application/precheck/precheck-limits.js';
import type { IPracticeUsageReader, PracticeUsage } from '../application/ports/practice-usage.reader.js';

/** Served by the (payer_id, actor_user_id, surface, created_at) index. */
@Injectable()
export class PrismaPracticeUsageReader implements IPracticeUsageReader {
  constructor(private readonly prisma: PrismaService) {}

  async usage(query: { schoolId: string; userId: string; exerciseId: string; from: Date; to: Date }): Promise<PracticeUsage> {
    const learner = {
      payerType: 'workspace' as const,
      payerId: query.schoolId,
      actorUserId: query.userId,
      surface: PRECHECK_SURFACE,
    };
    const window = { ...learner, createdAt: { gte: query.from, lt: query.to } };
    const [exercise, spent, checks] = await Promise.all([
      this.prisma.aiCall.groupBy({ by: ['checkId'], where: { ...learner, exerciseId: query.exerciseId, outcome: 'ok', checkId: { not: null } } }),
      this.prisma.aiCall.aggregate({ where: window, _sum: { credits: true } }),
      this.prisma.aiCall.groupBy({ by: ['checkId'], where: { ...window, outcome: 'ok', checkId: { not: null } } }),
    ]);
    return {
      exerciseChecks: exercise.length,
      // toFixed: a Decimal prints tiny sums in exponent form otherwise.
      learnerMicro: spent._sum.credits ? microCredits(spent._sum.credits.toFixed(6)) : 0n,
      learnerChecks: checks.length,
    };
  }
}
