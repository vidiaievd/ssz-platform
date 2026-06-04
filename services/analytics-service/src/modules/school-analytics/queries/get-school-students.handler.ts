import { Injectable, NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import type { AppConfig } from '../../../config/configuration.js';
import { GetSchoolStudentsQuery } from './get-school-students.query.js';
import type { SchoolStudentsResponseDto, SchoolStudentDto, StudentGroupDto } from '../dto/school-students-response.dto.js';

const NEW_STUDENT_DAYS = 14;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

@QueryHandler(GetSchoolStudentsQuery)
@Injectable()
export class GetSchoolStudentsHandler implements IQueryHandler<GetSchoolStudentsQuery, SchoolStudentsResponseDto> {
  private readonly atRiskDays: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig>,
  ) {
    this.atRiskDays = this.config.get<AppConfig['metrics']>('metrics')?.atRiskThresholdDays ?? 7;
  }

  async execute(query: GetSchoolStudentsQuery): Promise<SchoolStudentsResponseDto> {
    const { schoolId, viewerUserId } = query;
    const limit = Math.min(query.limit || DEFAULT_LIMIT, MAX_LIMIT);

    // ── 1. Authorization ────────────────────────────────────────────────────
    const membership = await this.prisma.schoolMembership.findUnique({
      where: { schoolId_userId: { schoolId, userId: viewerUserId } },
    });
    if (!membership) throw new NotFoundException('School not found or access denied');

    // ── 2. All STUDENT members of this school ───────────────────────────────
    const allStudentMembers = await this.prisma.schoolMembership.findMany({
      where: { schoolId, role: 'STUDENT' },
      orderBy: { joinedAt: 'asc' },
    });

    if (allStudentMembers.length === 0) {
      return { items: [], total: 0, nextCursor: null };
    }

    const userIds = allStudentMembers.map((m) => m.userId);

    // ── 3. Batch-fetch supporting projections ───────────────────────────────
    const [groupMemberships, userDirs, enrollments, recentActivities] = await Promise.all([
      // Groups per user for this school
      (this.prisma as any).groupMembership.findMany({
        where: { schoolId, userId: { in: userIds } },
        include: { group: true },
      }),
      // Display names
      this.prisma.userDirectory.findMany({
        where: { userId: { in: userIds } },
      }),
      // Latest enrollment per user (pick the most recent ACTIVE or COMPLETED)
      this.prisma.enrollmentProjection.findMany({
        where: { schoolId, userId: { in: userIds } },
        orderBy: { enrolledAt: 'desc' },
      }),
      // Latest activity per user
      this.prisma.progressActivity.findMany({
        where: { userId: { in: userIds } },
        orderBy: { occurredAt: 'desc' },
      }),
    ]);

    // ── 4. Index by userId ──────────────────────────────────────────────────
    const groupsByUser = new Map<string, typeof groupMemberships>();
    for (const gm of groupMemberships) {
      if (!groupsByUser.has(gm.userId)) groupsByUser.set(gm.userId, []);
      groupsByUser.get(gm.userId)!.push(gm);
    }

    const nameByUser = new Map(userDirs.map((u) => [u.userId, u.displayName]));

    const enrollmentByUser = new Map<string, typeof enrollments[0]>();
    for (const e of enrollments) {
      if (!enrollmentByUser.has(e.userId)) enrollmentByUser.set(e.userId, e);
    }

    const lastSeenByUser = new Map<string, Date>();
    for (const a of recentActivities) {
      if (!lastSeenByUser.has(a.userId)) lastSeenByUser.set(a.userId, a.occurredAt);
    }

    // ── 5. Build & derive status ────────────────────────────────────────────
    const now = new Date();
    const atRiskCutoff = new Date(now.getTime() - this.atRiskDays * 86400_000);
    const newCutoff = new Date(now.getTime() - NEW_STUDENT_DAYS * 86400_000);

    const allItems: SchoolStudentDto[] = allStudentMembers.map((member) => {
      const enrollment = enrollmentByUser.get(member.userId);
      const lastSeen = lastSeenByUser.get(member.userId) ?? null;
      const userGroups: typeof groupMemberships = groupsByUser.get(member.userId) ?? [];
      const enrolledAt = enrollment?.enrolledAt ?? member.joinedAt;

      // Progress: completed items / total items (0–1); simplified to enrollment status
      const progress = enrollment?.status === 'COMPLETED' ? 1.0 : 0.0;

      // Status derivation (spec §2)
      let status: string;
      if (enrollment?.status === 'COMPLETED') {
        status = 'finished';
      } else if (userGroups.length === 0) {
        status = 'unassigned';
      } else if (lastSeen && lastSeen >= atRiskCutoff) {
        status = 'active';
      } else if (enrolledAt >= newCutoff && !lastSeen) {
        status = 'new';
      } else {
        status = 'at-risk';
      }

      const groups: StudentGroupDto[] = userGroups.map((gm) => ({
        id: gm.groupId,
        name: gm.group?.name ?? gm.groupId,
        lang: gm.group?.lang ?? null,
        level: gm.group?.level ?? null,
      }));

      return {
        userId: member.userId,
        name: nameByUser.get(member.userId) ?? member.userId,
        status,
        groups,
        progress,
        lastSeen: lastSeen?.toISOString() ?? null,
        enrolledAt: (enrolledAt as Date).toISOString(),
      };
    });

    // ── 6. Filter by segment ────────────────────────────────────────────────
    let filtered = allItems;
    if (query.segment !== 'all') {
      filtered = allItems.filter((s) => s.status === query.segment);
    }

    // ── 7. Search filter ────────────────────────────────────────────────────
    if (query.search) {
      const q = query.search.toLowerCase();
      filtered = filtered.filter((s) => s.name.toLowerCase().includes(q));
    }

    const total = filtered.length;

    // ── 8. Cursor pagination (cursor = userId, items sorted by enrolledAt asc) ──
    let start = 0;
    if (query.cursor) {
      const idx = filtered.findIndex((s) => s.userId === query.cursor);
      if (idx >= 0) start = idx + 1;
    }

    const page = filtered.slice(start, start + limit);
    const nextCursor = start + limit < total ? page[page.length - 1]?.userId ?? null : null;

    return { items: page, total, nextCursor };
  }
}
