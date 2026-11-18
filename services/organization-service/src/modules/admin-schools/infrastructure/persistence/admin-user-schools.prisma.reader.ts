import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type { AdminUserSchoolRows, IAdminUserSchoolsReader } from '../../domain/admin-user-schools.js';

const SCHOOL_REF = {
  id: true,
  name: true,
  slug: true,
  kind: true,
  status: true,
  closesAt: true,
  purgeAt: true,
} as const satisfies Prisma.SchoolSelect;

/** Three queries for the schools and two for the groups, whatever the number of schools. */
@Injectable()
export class AdminUserSchoolsPrismaReader implements IAdminUserSchoolsReader {
  constructor(private readonly prisma: PrismaService) {}

  async rowsOf(userId: string): Promise<AdminUserSchoolRows> {
    const notPurged = { status: { not: 'purged' } } as const satisfies Prisma.SchoolWhereInput;
    const [owned, memberships] = await Promise.all([
      this.prisma.school.findMany({
        where: { ownerId: userId, ...notPurged },
        select: { ...SCHOOL_REF, createdAt: true },
      }),
      this.prisma.schoolMember.findMany({
        where: { userId, school: notPurged },
        select: { role: true, status: true, joinedAt: true, school: { select: SCHOOL_REF } },
      }),
    ]);

    const schoolIds = [...new Set([...owned.map((s) => s.id), ...memberships.map((m) => m.school.id)])];
    return { owned, memberships, groups: await this.groupsOf(userId, schoolIds) };
  }

  private async groupsOf(userId: string, schoolIds: string[]): Promise<AdminUserSchoolRows['groups']> {
    if (schoolIds.length === 0) return [];
    const today = startOfUtcDay(new Date());
    const group = { schoolId: { in: schoolIds }, deletedAt: null };
    const select = { group: { select: { id: true, name: true, isDefault: true, schoolId: true } } } as const;
    const [memberships, teaching] = await Promise.all([
      this.prisma.schoolGroupMember.findMany({
        where: { userId, status: 'active', group },
        select: { ...select, role: true },
      }),
      this.prisma.groupTeacher.findMany({
        where: { userId, group, ...teachingToday(today) },
        select,
      }),
    ]);

    const row = ({ schoolId, ...g }: { id: string; name: string; isDefault: boolean; schoolId: string }) => ({
      schoolId,
      group: g,
    });
    return [
      ...memberships.map((m) => ({ ...row(m.group), as: m.role })),
      ...teaching.map((t) => ({ ...row(t.group), as: 'teacher' as const })),
    ];
  }
}

/** An assignment counts until its last day; one without dates is open (as on the school's roster). */
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
