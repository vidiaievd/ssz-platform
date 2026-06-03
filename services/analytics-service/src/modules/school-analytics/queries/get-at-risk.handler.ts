import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import type { AppConfig } from '../../../config/configuration.js';
import { SchoolRole } from '@ssz/contracts';
import { GetAtRiskQuery } from './get-at-risk.query.js';
import type { GetAtRiskResponseDto, AtRiskStudentDto } from '../dto/at-risk-response.dto.js';

const OWNER_ADMIN = new Set<SchoolRole>([SchoolRole.OWNER, SchoolRole.ADMIN]);

@QueryHandler(GetAtRiskQuery)
@Injectable()
export class GetAtRiskHandler implements IQueryHandler<GetAtRiskQuery, GetAtRiskResponseDto> {
  private readonly atRiskDays: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig>,
  ) {
    this.atRiskDays = this.config.get<AppConfig['metrics']>('metrics')?.atRiskThresholdDays ?? 7;
  }

  async execute(query: GetAtRiskQuery): Promise<GetAtRiskResponseDto> {
    const { schoolId, viewerUserId, limit } = query;

    // ── 1. Authorization ────────────────────────────────────────────────────
    const membership = await this.prisma.schoolMembership.findUnique({
      where: { schoolId_userId: { schoolId, userId: viewerUserId } },
    });
    if (!membership) throw new NotFoundException('School not found or access denied');
    if (!OWNER_ADMIN.has(membership.role)) throw new ForbiddenException('Owner or admin role required');

    // ── 2. Active enrollments for this school ────────────────────────────────
    const enrollments = await this.prisma.enrollmentProjection.findMany({
      where: { schoolId, status: 'ACTIVE' },
      select: { userId: true, containerId: true, enrolledAt: true },
    });

    if (enrollments.length === 0) return { students: [], total: 0 };

    const studentIds = [...new Set(enrollments.map((e) => e.userId))];

    // ── 3. Identify at-risk: no activity in the threshold window ─────────────
    const threshold = new Date(Date.now() - this.atRiskDays * 24 * 3_600_000);
    const recentActivity = await this.prisma.progressActivity.findMany({
      where: { userId: { in: studentIds }, occurredAt: { gte: threshold } },
      select: { userId: true },
      distinct: ['userId'],
    });
    const recentSet = new Set(recentActivity.map((r) => r.userId));
    const atRiskIds = studentIds.filter((id) => !recentSet.has(id));
    const total = atRiskIds.length;

    if (total === 0) return { students: [], total: 0 };

    // ── 4. Last seen per student ─────────────────────────────────────────────
    const lastSeenRows = await this.prisma.progressActivity.findMany({
      where: { userId: { in: atRiskIds } },
      orderBy: { occurredAt: 'desc' },
      select: { userId: true, occurredAt: true },
      distinct: ['userId'],
    });
    const lastSeenMap = new Map(lastSeenRows.map((r) => [r.userId, r.occurredAt]));

    // ── 5. Sort: null lastSeen first (never active), then oldest first ────────
    const sortedIds = [...atRiskIds].sort((a, b) => {
      const aTs = lastSeenMap.get(a)?.getTime() ?? 0;
      const bTs = lastSeenMap.get(b)?.getTime() ?? 0;
      return aTs - bTs; // older (more at-risk) first
    });

    const pagedIds = sortedIds.slice(0, limit);

    // ── 6. Names from UserDirectory ──────────────────────────────────────────
    const userEntries = await this.prisma.userDirectory.findMany({
      where: { userId: { in: pagedIds } },
      select: { userId: true, displayName: true },
    });
    const nameMap = new Map(userEntries.map((u) => [u.userId, u.displayName]));

    // ── 7. Primary course per student: most recently enrolled active container
    const enrollmentsByStudent = new Map<string, Array<{ containerId: string; enrolledAt: Date }>>();
    for (const e of enrollments) {
      if (!pagedIds.includes(e.userId)) continue;
      const arr = enrollmentsByStudent.get(e.userId) ?? [];
      arr.push({ containerId: e.containerId, enrolledAt: e.enrolledAt });
      enrollmentsByStudent.set(e.userId, arr);
    }

    const allContainerIds = [...new Set(
      [...enrollmentsByStudent.values()].flatMap((arr) => arr.map((e) => e.containerId)),
    )];

    const containerEntries = await this.prisma.containerDirectory.findMany({
      where: { containerId: { in: allContainerIds }, deletedAt: null },
      select: { containerId: true, title: true, lang: true, leafItemCount: true },
    });
    const containerMap = new Map(containerEntries.map((c) => [c.containerId, c]));

    // ── 8. Completion ratio per student ─────────────────────────────────────
    // completedItems = distinct contentIds in ProgressActivity kind='completed'
    const completedRows = await this.prisma.progressActivity.findMany({
      where: { userId: { in: pagedIds }, kind: 'completed' },
      select: { userId: true, contentId: true },
      distinct: ['userId', 'contentId'],
    });
    const completedCountMap = new Map<string, number>();
    for (const r of completedRows) {
      completedCountMap.set(r.userId, (completedCountMap.get(r.userId) ?? 0) + 1);
    }

    // ── 9. Assemble response ─────────────────────────────────────────────────
    const students: AtRiskStudentDto[] = pagedIds.map((userId) => {
      const studentEnrollments = enrollmentsByStudent.get(userId) ?? [];
      const primaryEnrollment = studentEnrollments.sort(
        (a, b) => b.enrolledAt.getTime() - a.enrolledAt.getTime(),
      )[0];
      const container = primaryEnrollment
        ? containerMap.get(primaryEnrollment.containerId)
        : undefined;

      const totalLeafItems = studentEnrollments.reduce((sum, e) => {
        const c = containerMap.get(e.containerId);
        return sum + (c?.leafItemCount ?? 0);
      }, 0);
      const completedItems = completedCountMap.get(userId) ?? 0;
      const progress = totalLeafItems > 0 ? Math.round((completedItems / totalLeafItems) * 100) / 100 : 0;

      return {
        userId,
        name: nameMap.get(userId) ?? userId,
        course: container?.title,
        lastSeen: lastSeenMap.get(userId)?.toISOString() ?? null,
        progress,
        lang: container?.lang,
      };
    });

    return { students, total };
  }
}
