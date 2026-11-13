import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type { ISchoolRepository, PublicSchoolDetail, PublicSchoolFilter, PublicSchoolPage } from '../../domain/repositories/school.repository.interface.js';
import type { School } from '../../domain/entities/school.entity.js';
import type { ReviewSettings } from '../../domain/value-objects/review-settings.vo.js';
import type { ReviewAiPolicy } from '../../domain/value-objects/review-ai-policy.vo.js';
import { ReviewEffortMinutes } from '../../domain/value-objects/review-effort-minutes.vo.js';
import { AssistantAccess, type AssistantMode } from '../../domain/value-objects/assistant-access.vo.js';
import { AiPrecheckSettings } from '../../domain/value-objects/ai-precheck-settings.vo.js';
import { SchoolMapper } from './school.mapper.js';
import type { SchoolStatus } from '../../domain/school-access.policy.js';

const INCLUDE_MEMBERS = { members: true } as const;

@Injectable()
export class SchoolPrismaRepository implements ISchoolRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<School | null> {
    const raw = await (this.prisma as any).school.findUnique({
      where: { id },
      include: INCLUDE_MEMBERS,
    });
    return raw ? SchoolMapper.toDomain(raw) : null;
  }

  // Any status: a slug stays taken by a closed school and by a tombstone (the column is unique),
  // so availability checks must see them; readers decide visibility from the status.
  async findBySlug(slug: string): Promise<School | null> {
    const raw = await (this.prisma as any).school.findFirst({
      where: { slug },
      include: INCLUDE_MEMBERS,
    });
    return raw ? SchoolMapper.toDomain(raw) : null;
  }

  async findByName(name: string): Promise<School | null> {
    const raw = await (this.prisma as any).school.findFirst({
      where: { name, deletedAt: null },
      include: INCLUDE_MEMBERS,
    });
    return raw ? SchoolMapper.toDomain(raw) : null;
  }

  async findByOwnerId(ownerId: string): Promise<School[]> {
    const rows = await (this.prisma as any).school.findMany({
      // A closed school stays in the owner's list (they learn when it is purged); a tombstone does not.
      where: { ownerId, status: { not: 'purged' } },
      include: INCLUDE_MEMBERS,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(SchoolMapper.toDomain);
  }

  async findMemberSchools(userId: string): Promise<School[]> {
    const rows = await (this.prisma as any).school.findMany({
      where: {
        deletedAt: null,
        members: { some: { userId } },
      },
      include: INCLUDE_MEMBERS,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(SchoolMapper.toDomain);
  }

  async findStatus(schoolId: string): Promise<SchoolStatus | null> {
    const row = await (this.prisma as any).school.findUnique({ where: { id: schoolId }, select: { status: true } });
    return (row?.status as SchoolStatus | undefined) ?? null;
  }

  async findAllActive(): Promise<School[]> {
    const rows = await (this.prisma as any).school.findMany({
      where: { deletedAt: null, isActive: true, kind: 'SCHOOL' },
      include: INCLUDE_MEMBERS,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(SchoolMapper.toDomain);
  }

  async findPublicFiltered(filter: PublicSchoolFilter): Promise<PublicSchoolPage> {
    const { q, type, cursor, limit } = filter;

    let cursorDecoded: { name: string; id: string } | null = null;
    if (cursor) {
      try {
        cursorDecoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
      } catch {
        // invalid cursor — ignored, treated as first page
      }
    }

    // kind: a solo tutor workspace is private by construction and never listed.
    const baseConditions: any[] = [{ deletedAt: null, isActive: true, kind: 'SCHOOL' }];
    if (type) baseConditions.push({ type });
    if (q) {
      baseConditions.push({
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
          { city: { contains: q, mode: 'insensitive' } },
        ],
      });
    }

    const countWhere = { AND: baseConditions };

    const pageConditions = [...baseConditions];
    if (cursorDecoded) {
      pageConditions.push({
        OR: [
          { name: { gt: cursorDecoded.name } },
          { AND: [{ name: cursorDecoded.name }, { id: { gt: cursorDecoded.id } }] },
        ],
      });
    }
    const pageWhere = { AND: pageConditions };

    const [total, rawItems] = await Promise.all([
      (this.prisma as any).school.count({ where: countWhere }),
      (this.prisma as any).school.findMany({
        where: pageWhere,
        include: INCLUDE_MEMBERS,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        take: limit + 1,
      }),
    ]);

    const hasNextPage = rawItems.length > limit;
    const pageItems: typeof rawItems = hasNextPage ? rawItems.slice(0, limit) : rawItems;

    const lastItem = pageItems.at(-1);
    const endCursor = lastItem
      ? Buffer.from(JSON.stringify({ name: lastItem.name, id: lastItem.id }), 'utf8').toString('base64url')
      : null;

    return {
      items: pageItems.map(SchoolMapper.toDomain),
      total,
      endCursor,
      hasNextPage,
    };
  }

  async findPublicSchoolDetail(slug: string): Promise<PublicSchoolDetail | null> {
    const raw = await (this.prisma as any).school.findFirst({
      where: { slug, deletedAt: null, isActive: true, kind: 'SCHOOL' },
      include: {
        members: true,
        groups: {
          where: { deletedAt: null, status: 'active' },
          select: { level: true },
        },
      },
    });

    if (!raw) return null;

    const teacherMembers: { userId: string; name: string | null; avatarUrl: string | null }[] = [];
    let studentCount = 0;

    for (const m of raw.members as any[]) {
      if (m.role === 'STUDENT') {
        studentCount++;
      } else if (m.role === 'TEACHER') {
        teacherMembers.push({ userId: m.userId, name: m.name ?? null, avatarUrl: m.avatarUrl ?? null });
      }
    }

    const levels = Array.from(
      new Set((raw.groups as any[]).map((g: any) => g.level).filter(Boolean)),
    ).sort() as string[];

    return {
      school: SchoolMapper.toDomain(raw),
      studentCount,
      levels,
      teachers: teacherMembers,
    };
  }

  async findManagerCapabilities(userId: string, schoolIds: string[]): Promise<Map<string, string[]>> {
    if (schoolIds.length === 0) return new Map();
    const rows = await (this.prisma as any).schoolMemberPermission.findMany({
      where: { userId, schoolId: { in: schoolIds } },
      select: { schoolId: true, capabilities: true },
    });
    return new Map(rows.map((r: any) => [r.schoolId as string, r.capabilities as string[]]));
  }

  async saveReviewSettings(schoolId: string, settings: ReviewSettings): Promise<void> {
    await (this.prisma as any).school.update({
      where: { id: schoolId },
      data: {
        reviewRespondWithinHours: settings.respondWithinHours,
        reviewEscalateAfterHours: settings.escalateAfterHours,
        reviewEscalateTo: settings.escalateTo,
        updatedAt: new Date(),
      },
    });
  }

  async saveReviewAiPolicy(schoolId: string, policy: ReviewAiPolicy): Promise<void> {
    await (this.prisma as any).school.update({
      where: { id: schoolId },
      data: {
        reviewAiMode: policy.mode,
        reviewAutoAcceptAfterHours: policy.autoAcceptAfterHours,
        reviewSamplePercent: policy.samplePercent,
        updatedAt: new Date(),
      },
    });
  }

  async findReviewEffortMinutes(schoolId: string): Promise<ReviewEffortMinutes | null> {
    const row = await (this.prisma as any).school.findUnique({
      where: { id: schoolId },
      select: { reviewEffortMinutes: true },
    });
    return row ? ReviewEffortMinutes.rehydrate(row.reviewEffortMinutes) : null;
  }

  async saveReviewEffortMinutes(schoolId: string, minutes: ReviewEffortMinutes): Promise<void> {
    await (this.prisma as any).school.update({
      where: { id: schoolId },
      data: { reviewEffortMinutes: minutes.toJSON(), updatedAt: new Date() },
    });
  }

  async findAssistantAccess(schoolId: string): Promise<AssistantAccess | null> {
    const row = await (this.prisma as any).school.findUnique({
      where: { id: schoolId },
      select: { assistantMode: true, assistantGroupIds: true, assistantStudentIds: true },
    });
    return row
      ? AssistantAccess.rehydrate({
          mode: row.assistantMode as AssistantMode,
          groupIds: row.assistantGroupIds,
          studentIds: row.assistantStudentIds,
        })
      : null;
  }

  async saveAssistantAccess(schoolId: string, access: AssistantAccess): Promise<void> {
    await (this.prisma as any).school.update({
      where: { id: schoolId },
      data: {
        assistantMode: access.mode,
        assistantGroupIds: [...access.groupIds],
        assistantStudentIds: [...access.studentIds],
        updatedAt: new Date(),
      },
    });
  }

  async findAssistantSelectable(
    schoolId: string,
    groupIds: readonly string[],
    studentIds: readonly string[],
  ): Promise<{ groupIds: string[]; studentIds: string[] }> {
    const [groups, students] = await Promise.all([
      groupIds.length
        ? (this.prisma as any).schoolGroup.findMany({
            where: { schoolId, id: { in: [...groupIds] }, deletedAt: null },
            select: { id: true },
          })
        : [],
      studentIds.length
        ? (this.prisma as any).schoolMember.findMany({
            where: { schoolId, userId: { in: [...studentIds] }, role: 'STUDENT', status: 'active' },
            select: { userId: true },
          })
        : [],
    ]);
    return {
      groupIds: groups.map((g: { id: string }) => g.id),
      studentIds: students.map((m: { userId: string }) => m.userId),
    };
  }

  async findAiPrecheckSettings(schoolId: string): Promise<AiPrecheckSettings | null> {
    const row = await (this.prisma as any).school.findUnique({
      where: { id: schoolId },
      select: {
        aiPrecheckEnabled: true,
        aiPrecheckPerExerciseLimit: true,
        aiPrecheckPerLearnerMonthlyCredits: true,
      },
    });
    return row
      ? AiPrecheckSettings.rehydrate({
          enabled: row.aiPrecheckEnabled,
          perExerciseLimit: row.aiPrecheckPerExerciseLimit,
          perLearnerMonthlyCredits: row.aiPrecheckPerLearnerMonthlyCredits,
        })
      : null;
  }

  async saveAiPrecheckSettings(schoolId: string, settings: AiPrecheckSettings): Promise<void> {
    await (this.prisma as any).school.update({
      where: { id: schoolId },
      data: {
        aiPrecheckEnabled: settings.enabled,
        aiPrecheckPerExerciseLimit: settings.perExerciseLimit,
        aiPrecheckPerLearnerMonthlyCredits: settings.perLearnerMonthlyCredits,
        updatedAt: new Date(),
      },
    });
  }

  async save(school: School): Promise<void> {
    await (this.prisma as any).$transaction(async (tx: any) => {
      await tx.school.upsert({
        where: { id: school.id },
        create: {
          id: school.id,
          name: school.name,
          slug: school.slug,
          description: school.description ?? null,
          ownerId: school.ownerId,
          avatarUrl: school.avatarUrl ?? null,
          website: school.website ?? null,
          contactEmail: school.contactEmail ?? null,
          city: school.city ?? null,
          type: school.type,
          kind: school.kind,
          isActive: school.isActive,
          requireTutorReviewForSelfPaced: school.requireTutorReviewForSelfPaced,
          defaultExplanationLanguage: school.defaultExplanationLanguage ?? null,
          showGroupPositionToStudents: school.showGroupPositionToStudents,
          createdAt: school.createdAt,
          updatedAt: school.updatedAt,
          deletedAt: school.deletedAt ?? null,
        },
        update: {
          name: school.name,
          slug: school.slug,
          description: school.description ?? null,
          avatarUrl: school.avatarUrl ?? null,
          website: school.website ?? null,
          contactEmail: school.contactEmail ?? null,
          city: school.city ?? null,
          type: school.type,
          // No `isActive` / `deletedAt`: the lifecycle repository owns them (plan 90, phase 5), and a
          // stale aggregate saved after a suspension must not open the school again.
          requireTutorReviewForSelfPaced: school.requireTutorReviewForSelfPaced,
          defaultExplanationLanguage: school.defaultExplanationLanguage ?? null,
          showGroupPositionToStudents: school.showGroupPositionToStudents,
          updatedAt: school.updatedAt,
        },
      });

      // Write only the roster changes made through this aggregate. Syncing the whole loaded list
      // would let a stale aggregate erase members another request added meanwhile (two learners
      // added at once wiping each other, past the seat check — plan 90, phase 4) or bring back
      // members another request removed. Deleting the whole roster first would also take the
      // columns the aggregate does not carry (status, level) and, through the cascade, teacher
      // attrs and capability grants. A row already written by the seat claim is skipped.
      const added = school.addedMembers;
      if (added.length > 0) {
        await tx.schoolMember.createMany({
          data: added.map((m) => ({
            id: m.id,
            schoolId: m.schoolId,
            userId: m.userId,
            role: m.role,
            joinedAt: m.joinedAt,
            name: m.name,
            avatarUrl: m.avatarUrl,
          })),
          skipDuplicates: true,
        });
      }

      const removed = school.removedMemberUserIds;
      if (removed.length > 0) {
        await tx.schoolMember.deleteMany({ where: { schoolId: school.id, userId: { in: removed } } });
      }
    });
  }
}
