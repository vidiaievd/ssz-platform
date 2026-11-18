import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import {
  adminMemberRole,
  type AdminMemberFilter,
  type AdminMemberGroup,
  type AdminMemberPage,
  type AdminSchoolSettings,
  type IAdminSchoolRosterReader,
} from '../../domain/admin-school-roster.js';

/** A page of members costs three queries whatever its size: the page, the count, the groups of the page. */
@Injectable()
export class AdminSchoolRosterPrismaReader implements IAdminSchoolRosterReader {
  constructor(private readonly prisma: PrismaService) {}

  async members(schoolId: string, filter: AdminMemberFilter, page: number, limit: number): Promise<AdminMemberPage | null> {
    const school = await this.prisma.school.findUnique({ where: { id: schoolId }, select: { id: true } });
    if (!school) return null;

    const today = startOfUtcDay(new Date());
    const where = await this.whereOf(schoolId, filter, today);
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.schoolMember.count({ where }),
      this.prisma.schoolMember.findMany({
        where,
        orderBy: [{ joinedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: { userId: true, name: true, role: true, status: true, joinedAt: true },
      }),
    ]);

    const groups = await this.groupsOf(schoolId, rows.map((r) => r.userId), today);
    return {
      items: rows.map((r) => ({
        userId: r.userId,
        name: r.name,
        role: adminMemberRole(r.role),
        rosterRole: r.role,
        status: r.status,
        joinedAt: r.joinedAt,
        groups: groups.get(r.userId) ?? [],
      })),
      total,
      page,
      limit,
    };
  }

  async settings(schoolId: string): Promise<AdminSchoolSettings | null> {
    const school = await this.prisma.school.findUnique({
      where: { id: schoolId },
      select: {
        reviewRespondWithinHours: true,
        reviewEscalateAfterHours: true,
        reviewEscalateTo: true,
        reviewAiMode: true,
        reviewAutoAcceptAfterHours: true,
        reviewSamplePercent: true,
        assistantMode: true,
        assistantGroupIds: true,
        assistantStudentIds: true,
        aiPrecheckEnabled: true,
        aiPrecheckPerExerciseLimit: true,
        aiPrecheckPerLearnerMonthlyCredits: true,
      },
    });
    if (!school) return null;

    // The row keeps a deleted group or an archived student until the school saves again;
    // the school's own screen hides them, and so does this one.
    const [groups, students] = await Promise.all([
      school.assistantGroupIds.length
        ? this.prisma.schoolGroup.findMany({
            where: { schoolId, id: { in: school.assistantGroupIds }, deletedAt: null },
            select: { id: true },
          })
        : [],
      school.assistantStudentIds.length
        ? this.prisma.schoolMember.findMany({
            where: { schoolId, userId: { in: school.assistantStudentIds }, role: 'STUDENT', status: 'active' },
            select: { userId: true },
          })
        : [],
    ]);
    const liveGroups = new Set(groups.map((g) => g.id));
    const liveStudents = new Set(students.map((s) => s.userId));

    return {
      review: {
        respondWithinHours: school.reviewRespondWithinHours,
        escalateAfterHours: school.reviewEscalateAfterHours,
        escalateTo: school.reviewEscalateTo,
      },
      reviewAi: {
        mode: school.reviewAiMode,
        autoAcceptAfterHours: school.reviewAutoAcceptAfterHours,
        samplePercent: school.reviewSamplePercent,
      },
      assistant: {
        mode: school.assistantMode,
        groupIds: school.assistantGroupIds.filter((id) => liveGroups.has(id)),
        studentIds: school.assistantStudentIds.filter((id) => liveStudents.has(id)),
      },
      aiPrecheck: {
        enabled: school.aiPrecheckEnabled,
        perExerciseLimit: school.aiPrecheckPerExerciseLimit,
        perLearnerMonthlyCredits: school.aiPrecheckPerLearnerMonthlyCredits,
      },
    };
  }

  private async whereOf(schoolId: string, filter: AdminMemberFilter, today: Date): Promise<Prisma.SchoolMemberWhereInput> {
    const where: Prisma.SchoolMemberWhereInput = { schoolId };
    if (filter.role === 'student') where.role = 'STUDENT';
    if (filter.role === 'teacher') where.role = 'TEACHER';
    if (filter.role === 'staff') where.role = { notIn: ['STUDENT', 'TEACHER'] };
    if (filter.status) where.status = filter.status;
    if (filter.groupId) {
      // Group rows carry no member id, only the user id — so the group's people are read first.
      const group = { id: filter.groupId, schoolId, deletedAt: null };
      const [members, teachers] = await Promise.all([
        this.prisma.schoolGroupMember.findMany({
          where: { status: 'active', group },
          select: { userId: true },
        }),
        this.prisma.groupTeacher.findMany({
          where: { group, ...teachingToday(today) },
          select: { userId: true },
        }),
      ]);
      where.userId = { in: [...new Set([...members, ...teachers].map((r) => r.userId))] };
    }
    return where;
  }

  private async groupsOf(schoolId: string, userIds: string[], today: Date): Promise<Map<string, AdminMemberGroup[]>> {
    const byUser = new Map<string, AdminMemberGroup[]>();
    if (userIds.length === 0) return byUser;

    const group = { schoolId, deletedAt: null };
    const select = { userId: true, group: { select: { id: true, name: true, isDefault: true } } } as const;
    const [memberships, teaching] = await Promise.all([
      this.prisma.schoolGroupMember.findMany({
        where: { userId: { in: userIds }, status: 'active', group },
        select: { ...select, role: true },
      }),
      this.prisma.groupTeacher.findMany({
        where: { userId: { in: userIds }, group, ...teachingToday(today) },
        select,
      }),
    ]);

    const add = (userId: string, g: { id: string; name: string; isDefault: boolean }, as: AdminMemberGroup['as']) => {
      const list = byUser.get(userId) ?? [];
      // A teacher can hold one group as primary and as substitute; the group shows once.
      if (!list.some((x) => x.id === g.id && x.as === as)) list.push({ id: g.id, name: g.name, isDefault: g.isDefault, as });
      byUser.set(userId, list);
    };
    for (const m of memberships) add(m.userId, m.group, m.role);
    for (const t of teaching) add(t.userId, t.group, 'teacher');
    for (const list of byUser.values()) list.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    return byUser;
  }
}

/** An assignment counts until its last day; one without dates is open. */
function teachingToday(today: Date): Prisma.GroupTeacherWhereInput {
  return {
    AND: [
      { OR: [{ fromDate: null }, { fromDate: { lte: today } }] },
      { OR: [{ toDate: null }, { toDate: { gte: today } }] },
    ],
  };
}

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
