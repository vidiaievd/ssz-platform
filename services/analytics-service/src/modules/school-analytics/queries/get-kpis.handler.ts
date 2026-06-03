import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import type { AppConfig } from '../../../config/configuration.js';
import { SchoolRole } from '@ssz/contracts';
import { GetKpisQuery } from './get-kpis.query.js';
import type { GetKpisResponseDto, KpiDto } from '../dto/kpi-response.dto.js';

const OWNER_ADMIN = new Set<SchoolRole>([SchoolRole.OWNER, SchoolRole.ADMIN]);
const ANALYTICS_VIEWER_ROLES = new Set<SchoolRole>([SchoolRole.OWNER, SchoolRole.ADMIN, SchoolRole.TEACHER, SchoolRole.CONTENT_ADMIN]);

function dayBuckets(now: Date, days: number): Date[] {
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - (days - 1 - i));
    d.setUTCHours(0, 0, 0, 0);
    return d;
  });
}

function normalizeToScale(counts: number[], scale = 100): number[] {
  const max = Math.max(...counts, 1);
  return counts.map((c) => Math.round((c / max) * scale));
}

function formatDelta(current: number, previous: number): { delta: string; trend: 'up' | 'down' | 'flat' } {
  const diff = current - previous;
  if (diff === 0) return { delta: '0', trend: 'flat' };
  if (diff > 0) return { delta: `+${diff}`, trend: 'up' };
  return { delta: String(diff), trend: 'down' };
}

function formatDuration(ms: number): string {
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''}`;
  const days = Math.floor(hours / 24);
  return `${days} day${days !== 1 ? 's' : ''}`;
}

@QueryHandler(GetKpisQuery)
@Injectable()
export class GetKpisHandler implements IQueryHandler<GetKpisQuery, GetKpisResponseDto> {
  private readonly atRiskDays: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig>,
  ) {
    this.atRiskDays = this.config.get<AppConfig['metrics']>('metrics')?.atRiskThresholdDays ?? 7;
  }

  async execute(query: GetKpisQuery): Promise<GetKpisResponseDto> {
    const { schoolId, viewerUserId } = query;

    // ── 1. Viewer authorization via SchoolMembership projection ──────────────
    const membership = await this.prisma.schoolMembership.findUnique({
      where: { schoolId_userId: { schoolId, userId: viewerUserId } },
    });
    if (!membership) throw new NotFoundException('School not found or access denied');
    const role = membership.role as SchoolRole;
    if (!ANALYTICS_VIEWER_ROLES.has(role)) throw new ForbiddenException('Insufficient role');

    const isOwnerAdmin = OWNER_ADMIN.has(role);

    // ── 2. School students = DISTINCT userId of active enrollments ───────────
    const activeEnrollments = await this.prisma.enrollmentProjection.findMany({
      where: { schoolId, status: 'ACTIVE' },
      select: { userId: true },
      distinct: ['userId'],
    });
    const studentIds = activeEnrollments.map((e) => e.userId);
    const totalEnrolled = studentIds.length;

    if (totalEnrolled === 0) {
      return this.emptyResponse(role);
    }

    const now = new Date();
    const d7 = new Date(now.getTime() - 7 * 24 * 3_600_000);
    const d14 = new Date(now.getTime() - 14 * 24 * 3_600_000);

    // ── 3. Check data history depth (need ≥14d for deltas) ──────────────────
    const oldestActivity = await this.prisma.progressActivity.findFirst({
      where: { userId: { in: studentIds } },
      orderBy: { occurredAt: 'asc' },
      select: { occurredAt: true },
    });
    const hasTwoWeeks = !!oldestActivity && oldestActivity.occurredAt <= d14;

    // ── 4. Parallel data fetches ─────────────────────────────────────────────
    const [
      active7d,
      activePrev7d,
      spark7dRaw,
      completed7d,
      completedPrev7d,
      completedSpark7dRaw,
      activeCourses,
      pendingReviews,
      atRiskCount,
      atRiskPrev,
    ] = await Promise.all([
      // active_students_7d — current
      this.prisma.progressActivity.findMany({
        where: { userId: { in: studentIds }, occurredAt: { gte: d7 } },
        select: { userId: true, occurredAt: true },
      }),
      // active_students_7d — previous window
      hasTwoWeeks
        ? this.prisma.progressActivity.findMany({
            where: { userId: { in: studentIds }, occurredAt: { gte: d14, lt: d7 } },
            select: { userId: true },
          })
        : Promise.resolve(null),
      // active_students_7d sparkline raw
      this.prisma.progressActivity.findMany({
        where: { userId: { in: studentIds }, occurredAt: { gte: d7 } },
        select: { userId: true, occurredAt: true },
      }),
      // lessons_completed_7d — current
      this.prisma.progressActivity.count({
        where: { userId: { in: studentIds }, kind: 'completed', occurredAt: { gte: d7 } },
      }),
      // lessons_completed_7d — previous
      hasTwoWeeks
        ? this.prisma.progressActivity.count({
            where: { userId: { in: studentIds }, kind: 'completed', occurredAt: { gte: d14, lt: d7 } },
          })
        : Promise.resolve(null),
      // lessons_completed sparkline raw
      this.prisma.progressActivity.findMany({
        where: { userId: { in: studentIds }, kind: 'completed', occurredAt: { gte: d7 } },
        select: { occurredAt: true },
      }),
      // active courses
      this.prisma.enrollmentProjection.findMany({
        where: { schoolId, status: 'ACTIVE' },
        select: { containerId: true },
        distinct: ['containerId'],
      }),
      // pending reviews
      this.prisma.submissionProjection.findMany({
        where: {
          schoolId,
          status: { in: ['PENDING_REVIEW', 'RESUBMITTED'] },
        },
        select: { submittedAt: true },
        orderBy: { submittedAt: 'asc' },
      }),
      // at_risk current
      isOwnerAdmin
        ? this.computeAtRiskCount(studentIds, now)
        : Promise.resolve(0),
      // at_risk previous (for delta)
      isOwnerAdmin && hasTwoWeeks
        ? this.computeAtRiskCount(studentIds, d7)
        : Promise.resolve(null),
    ]);

    // ── 5. Build KPI: active_students_7d ─────────────────────────────────────
    const activeStudents = new Set(active7d.map((r) => r.userId)).size;
    const activeSpark = this.buildDaySpark(
      active7d.map((r) => ({ userId: r.userId, occurredAt: r.occurredAt })),
      now,
      7,
      'distinct',
    );
    const activeDelta =
      hasTwoWeeks && activePrev7d !== null
        ? formatDelta(activeStudents, new Set(activePrev7d.map((r) => r.userId)).size)
        : null;

    const kpiActive: KpiDto = {
      key: 'active_students_7d',
      label: 'Active students · 7d',
      value: activeStudents,
      ...(activeDelta ? { delta: activeDelta.delta, trend: activeDelta.trend } : {}),
      hint: `of ${totalEnrolled} enrolled`,
      spark: normalizeToScale(activeSpark),
    };

    // ── 6. Build KPI: lessons_completed_7d ────────────────────────────────────
    const completedSpark = this.buildDaySpark(
      completedSpark7dRaw.map((r) => ({ occurredAt: r.occurredAt })),
      now,
      7,
      'count',
    );
    const completedDelta =
      hasTwoWeeks && completedPrev7d !== null
        ? formatDelta(completed7d, completedPrev7d)
        : null;

    const kpiCompleted: KpiDto = {
      key: 'lessons_completed_7d',
      label: 'Lessons completed · 7d',
      value: completed7d,
      ...(completedDelta ? { delta: completedDelta.delta, trend: completedDelta.trend } : {}),
      hint: `across ${activeCourses.length} course${activeCourses.length !== 1 ? 's' : ''}`,
      spark: normalizeToScale(completedSpark),
    };

    // ── 7. Build KPI: pending_reviews ────────────────────────────────────────
    const pendingCount = pendingReviews.length;
    const oldestMs =
      pendingCount > 0 ? now.getTime() - pendingReviews[0].submittedAt.getTime() : 0;

    const kpiPending: KpiDto = {
      key: 'pending_reviews',
      label: 'Pending reviews',
      value: pendingCount,
      hint: 'writing + speaking submissions',
      ...(pendingCount > 0 ? { sub: `oldest: ${formatDuration(oldestMs)}` } : {}),
    };

    // ── 8. Build KPI: at_risk (owner/admin only) ──────────────────────────────
    const kpis: KpiDto[] = [kpiActive, kpiCompleted, kpiPending];

    if (isOwnerAdmin) {
      const atRiskDelta =
        hasTwoWeeks && atRiskPrev !== null
          ? formatDelta(atRiskCount, atRiskPrev)
          : null;

      kpis.push({
        key: 'at_risk',
        label: 'At-risk students',
        value: atRiskCount,
        ...(atRiskDelta ? { delta: atRiskDelta.delta, trend: atRiskDelta.trend } : {}),
        hint: `haven't logged in ${this.atRiskDays}+ days`,
      });
    }

    return { role, kpis };
  }

  private async computeAtRiskCount(studentIds: string[], asOf: Date): Promise<number> {
    const threshold = new Date(asOf.getTime() - this.atRiskDays * 24 * 3_600_000);
    const recentlyActive = await this.prisma.progressActivity.findMany({
      where: { userId: { in: studentIds }, occurredAt: { gte: threshold, lt: asOf } },
      select: { userId: true },
      distinct: ['userId'],
    });
    const activeSet = new Set(recentlyActive.map((r) => r.userId));
    return studentIds.filter((id) => !activeSet.has(id)).length;
  }

  private buildDaySpark(
    rows: Array<{ userId?: string; occurredAt: Date }>,
    now: Date,
    days: number,
    mode: 'distinct' | 'count',
  ): number[] {
    const buckets = dayBuckets(now, days);
    const result = new Array<number>(days).fill(0);

    for (const row of rows) {
      const dayStart = new Date(row.occurredAt);
      dayStart.setUTCHours(0, 0, 0, 0);
      const idx = buckets.findIndex(
        (b) => b.getTime() === dayStart.getTime(),
      );
      if (idx === -1) continue;
      result[idx]++;
    }

    if (mode === 'distinct') {
      // Re-compute per-day distinct userId counts
      const daySets = new Map<number, Set<string>>();
      for (const row of rows) {
        const dayStart = new Date(row.occurredAt);
        dayStart.setUTCHours(0, 0, 0, 0);
        const idx = buckets.findIndex((b) => b.getTime() === dayStart.getTime());
        if (idx === -1) continue;
        if (!daySets.has(idx)) daySets.set(idx, new Set());
        daySets.get(idx)!.add(row.userId!);
      }
      return buckets.map((_, i) => daySets.get(i)?.size ?? 0);
    }

    return result;
  }

  private emptyResponse(role: SchoolRole): GetKpisResponseDto {
    const base: KpiDto[] = [
      { key: 'active_students_7d', label: 'Active students · 7d', value: 0, hint: 'of 0 enrolled' },
      { key: 'lessons_completed_7d', label: 'Lessons completed · 7d', value: 0, hint: 'across 0 courses' },
      { key: 'pending_reviews', label: 'Pending reviews', value: 0, hint: 'writing + speaking submissions' },
    ];
    if (OWNER_ADMIN.has(role)) {
      base.push({ key: 'at_risk', label: 'At-risk students', value: 0, hint: `haven't logged in ${this.atRiskDays}+ days` });
    }
    return { role, kpis: base };
  }
}
