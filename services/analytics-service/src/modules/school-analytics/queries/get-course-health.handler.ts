import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import type { AppConfig } from '../../../config/configuration.js';
import { SchoolRole } from '@ssz/contracts';
import { GetCourseHealthQuery } from './get-course-health.query.js';
import type { GetCourseHealthResponseDto, CourseHealthDto } from '../dto/course-health-response.dto.js';
import { CourseCompletionService, completionRatio } from '../course-completion.service.js';

const ALLOWED_ROLES = new Set<SchoolRole>([SchoolRole.OWNER, SchoolRole.ADMIN, SchoolRole.TEACHER, SchoolRole.CONTENT_ADMIN]);

@QueryHandler(GetCourseHealthQuery)
@Injectable()
export class GetCourseHealthHandler implements IQueryHandler<GetCourseHealthQuery, GetCourseHealthResponseDto> {
  private readonly dropoffThreshold: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig>,
    private readonly completion: CourseCompletionService,
  ) {
    this.dropoffThreshold =
      this.config.get<AppConfig['metrics']>('metrics')?.dropoffCompletionThreshold ?? 0.3;
  }

  async execute(query: GetCourseHealthQuery): Promise<GetCourseHealthResponseDto> {
    const { schoolId, viewerUserId } = query;

    // ── 1. Authorization ────────────────────────────────────────────────────
    const membership = await this.prisma.schoolMembership.findUnique({
      where: { schoolId_userId: { schoolId, userId: viewerUserId } },
    });
    if (!membership) throw new NotFoundException('School not found or access denied');
    if (!ALLOWED_ROLES.has(membership.role as SchoolRole)) throw new ForbiddenException('Insufficient role');

    // ── 2. Active enrollments grouped by containerId ─────────────────────────
    const enrollments = await this.prisma.enrollmentProjection.findMany({
      where: { schoolId, status: 'ACTIVE' },
      select: { userId: true, containerId: true },
    });

    if (enrollments.length === 0) return { courses: [] };

    // count active students per course
    const courseStudentMap = new Map<string, Set<string>>();
    for (const e of enrollments) {
      const set = courseStudentMap.get(e.containerId) ?? new Set();
      set.add(e.userId);
      courseStudentMap.set(e.containerId, set);
    }

    const containerIds = [...courseStudentMap.keys()];
    const allStudentIds = [...new Set(enrollments.map((e) => e.userId))];

    // ── 3. Container metadata ────────────────────────────────────────────────
    const containers = await this.prisma.containerDirectory.findMany({
      where: { containerId: { in: containerIds }, deletedAt: null },
      select: { containerId: true, title: true, lang: true },
    });
    const containerMap = new Map(containers.map((c) => [c.containerId, c]));

    // ── 4. Items of each course passed by each enrolled learner ───────────────
    const completionByCourse = await this.completion.completionOf(containerIds, allStudentIds);

    // ── 5. Trend: compare completions in last 7d vs previous 7d ──────────────
    const now = new Date();
    const d7 = new Date(now.getTime() - 7 * 24 * 3_600_000);
    const d14 = new Date(now.getTime() - 14 * 24 * 3_600_000);

    const recentCompletions = await this.prisma.progressActivity.findMany({
      where: { userId: { in: allStudentIds }, kind: 'completed', occurredAt: { gte: d7 } },
      select: { userId: true },
    });
    const prevCompletions = await this.prisma.progressActivity.findMany({
      where: { userId: { in: allStudentIds }, kind: 'completed', occurredAt: { gte: d14, lt: d7 } },
      select: { userId: true },
    });

    // Map recent/prev active students per course (student enrolled → attribute to all their courses)
    const recentActiveUsers = new Set(recentCompletions.map((r) => r.userId));
    const prevActiveUsers = new Set(prevCompletions.map((r) => r.userId));

    // ── 6. Assemble course health rows ───────────────────────────────────────
    const courses: CourseHealthDto[] = [];

    for (const [containerId, studentSet] of courseStudentMap) {
      const container = containerMap.get(containerId);
      if (!container) continue;

      const enrollment = studentSet.size;
      const { items, passedBy } = completionByCourse.get(containerId) ?? {
        items: 0,
        passedBy: new Map<string, number>(),
      };

      // completion = items passed by the enrolled learners / (enrollment × the course's items)
      const totalPassed = [...studentSet].reduce(
        (sum, uid) => sum + Math.min(passedBy.get(uid) ?? 0, items),
        0,
      );
      const completion = completionRatio(totalPassed, enrollment * items);

      // trend: more recent active students than previous period → up
      const recentCount = [...studentSet].filter((id) => recentActiveUsers.has(id)).length;
      const prevCount = [...studentSet].filter((id) => prevActiveUsers.has(id)).length;
      const trend: 'up' | 'down' | 'flat' =
        recentCount > prevCount ? 'up' : recentCount < prevCount ? 'down' : 'flat';

      courses.push({
        courseId: containerId,
        name: container.title,
        lang: container.lang,
        enrollment,
        completion,
        trend,
        // A course whose items are unknown (outline unreadable, nothing published) is not
        // flagged: low completion of nothing is not a drop-off.
        ...(items > 0 && completion < this.dropoffThreshold ? { dropoff: true } : {}),
      });
    }

    // Sort by enrollment desc (highest enrolled first)
    courses.sort((a, b) => b.enrollment - a.enrollment);

    return { courses };
  }
}
