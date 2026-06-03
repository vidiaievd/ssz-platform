import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ANALYTICS_EVENT_TYPES, SchoolRole } from '@ssz/contracts';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import { EventPublisherService } from '../../../infrastructure/messaging/event-publisher.service.js';
import { NudgeAtRiskCommand } from './nudge-at-risk.command.js';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../../config/configuration.js';

const OWNER_ADMIN = new Set<SchoolRole>([SchoolRole.OWNER, SchoolRole.ADMIN]);

export interface NudgeAtRiskResult {
  nudged: number;
}

@CommandHandler(NudgeAtRiskCommand)
@Injectable()
export class NudgeAtRiskHandler implements ICommandHandler<NudgeAtRiskCommand, NudgeAtRiskResult> {
  private readonly atRiskDays: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly publisher: EventPublisherService,
    private readonly config: ConfigService<AppConfig>,
  ) {
    this.atRiskDays = this.config.get<AppConfig['metrics']>('metrics')?.atRiskThresholdDays ?? 7;
  }

  async execute(command: NudgeAtRiskCommand): Promise<NudgeAtRiskResult> {
    const { schoolId, requestedBy } = command;

    // ── 1. Authorization ───────────────────────────────────────────────────
    const membership = await this.prisma.schoolMembership.findUnique({
      where: { schoolId_userId: { schoolId, userId: requestedBy } },
    });
    if (!membership) throw new NotFoundException('School not found or access denied');
    if (!OWNER_ADMIN.has(membership.role)) throw new ForbiddenException('Owner or admin role required');

    // ── 2. At-risk student ids ─────────────────────────────────────────────
    const enrollments = await this.prisma.enrollmentProjection.findMany({
      where: { schoolId, status: 'ACTIVE' },
      select: { userId: true },
      distinct: ['userId'],
    });
    const studentIds = enrollments.map((e) => e.userId);

    if (studentIds.length === 0) return { nudged: 0 };

    const threshold = new Date(Date.now() - this.atRiskDays * 24 * 3_600_000);
    const recentActivity = await this.prisma.progressActivity.findMany({
      where: { userId: { in: studentIds }, occurredAt: { gte: threshold } },
      select: { userId: true },
      distinct: ['userId'],
    });
    const activeSet = new Set(recentActivity.map((r) => r.userId));
    const atRiskIds = studentIds.filter((id) => !activeSet.has(id));

    if (atRiskIds.length === 0) return { nudged: 0 };

    // ── 3. Publish per-student nudge events ───────────────────────────────
    await Promise.all(
      atRiskIds.map((userId) =>
        this.publisher.publish(ANALYTICS_EVENT_TYPES.NUDGE_REQUESTED, {
          schoolId,
          userId,
          requestedBy,
        }),
      ),
    );

    return { nudged: atRiskIds.length };
  }
}
