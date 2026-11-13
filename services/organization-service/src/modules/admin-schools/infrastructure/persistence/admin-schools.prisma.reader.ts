import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import {
  schoolStatus,
  type AdminSchoolCounts,
  type AdminSchoolDetail,
  type AdminSchoolFilter,
  type AdminSchoolPage,
  type AdminSchoolSort,
  type IAdminSchoolsReader,
} from '../../domain/admin-school.js';

const STAFF_ROLES = ['ADMIN', 'MANAGER', 'CONTENT_ADMIN', 'SCHEDULER'] as const;

/** Every count is one grouped query over the page's ids, so a page costs the same at 5 rows and at 100. */
@Injectable()
export class AdminSchoolsPrismaReader implements IAdminSchoolsReader {
  constructor(private readonly prisma: PrismaService) {}

  async list(filter: AdminSchoolFilter, sort: AdminSchoolSort, page: number, limit: number): Promise<AdminSchoolPage> {
    const where = whereOf(filter);
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.school.count({ where }),
      this.prisma.school.findMany({
        where,
        orderBy: orderOf(sort),
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          name: true,
          slug: true,
          kind: true,
          isActive: true,
          deletedAt: true,
          ownerId: true,
          city: true,
          createdAt: true,
        },
      }),
    ]);

    const counts = await this.rosterCounts(rows.map((r) => r.id));
    return {
      items: rows.map((r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        kind: r.kind,
        status: schoolStatus(r.isActive, r.deletedAt),
        ownerId: r.ownerId,
        city: r.city,
        createdAt: r.createdAt,
        counts: counts.get(r.id) ?? { students: 0, teachers: 0 },
      })),
      total,
      page,
      limit,
    };
  }

  async findById(id: string): Promise<(Omit<AdminSchoolDetail, 'owner'> & { ownerId: string }) | null> {
    const school = await this.prisma.school.findUnique({ where: { id } });
    if (!school) return null;

    const [roster, pendingApplications, pendingInvitations, groups] = await Promise.all([
      this.prisma.schoolMember.groupBy({
        by: ['role', 'status'],
        where: { schoolId: id },
        _count: { _all: true },
      }),
      this.prisma.schoolMembership.count({
        where: { schoolId: id, status: { in: ['pending', 'placement_review'] } },
      }),
      this.prisma.schoolInvitation.count({
        where: { schoolId: id, status: 'PENDING', expiresAt: { gt: new Date() } },
      }),
      this.prisma.schoolGroup.findMany({
        where: { schoolId: id, deletedAt: null },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          name: true,
          status: true,
          isDefault: true,
          courseId: true,
          level: true,
          materials: { select: { courseId: true } },
          _count: { select: { members: { where: { status: 'active', role: 'student' } } } },
        },
      }),
    ]);

    const tally = (match: (r: (typeof roster)[number]) => boolean) =>
      roster.filter(match).reduce((sum, r) => sum + r._count._all, 0);

    const courseIds = new Set<string>();
    for (const g of groups) {
      if (g.courseId) courseIds.add(g.courseId);
      for (const m of g.materials) courseIds.add(m.courseId);
    }

    return {
      id: school.id,
      name: school.name,
      slug: school.slug,
      kind: school.kind,
      type: school.type,
      status: schoolStatus(school.isActive, school.deletedAt),
      description: school.description,
      avatarUrl: school.avatarUrl,
      contacts: { email: school.contactEmail, website: school.website, city: school.city },
      ownerId: school.ownerId,
      createdAt: school.createdAt,
      updatedAt: school.updatedAt,
      deletedAt: school.deletedAt,
      counts: {
        students: tally((r) => r.role === 'STUDENT' && r.status === 'active'),
        archivedStudents: tally((r) => r.role === 'STUDENT' && r.status === 'archived'),
        teachers: tally((r) => r.role === 'TEACHER'),
        staff: tally((r) => (STAFF_ROLES as readonly string[]).includes(r.role)),
        pendingApplications,
        pendingInvitations,
      },
      groups: groups.map((g) => ({
        id: g.id,
        name: g.name,
        status: g.status,
        isDefault: g.isDefault,
        courseId: g.courseId,
        level: g.level,
        students: g._count.members,
      })),
      courses: { count: courseIds.size, ids: [...courseIds].sort() },
    };
  }

  private async rosterCounts(schoolIds: string[]): Promise<Map<string, AdminSchoolCounts>> {
    const counts = new Map<string, AdminSchoolCounts>();
    if (schoolIds.length === 0) return counts;

    const rows = await this.prisma.schoolMember.groupBy({
      by: ['schoolId', 'role'],
      where: {
        schoolId: { in: schoolIds },
        OR: [{ role: 'STUDENT', status: 'active' }, { role: 'TEACHER' }],
      },
      _count: { _all: true },
    });
    for (const r of rows) {
      const entry = counts.get(r.schoolId) ?? { students: 0, teachers: 0 };
      if (r.role === 'STUDENT') entry.students += r._count._all;
      else entry.teachers += r._count._all;
      counts.set(r.schoolId, entry);
    }
    return counts;
  }
}

function whereOf(filter: AdminSchoolFilter): Prisma.SchoolWhereInput {
  const where: Prisma.SchoolWhereInput = {};
  if (filter.kind) where.kind = filter.kind;
  if (filter.status === 'active') Object.assign(where, { isActive: true, deletedAt: null });
  if (filter.status === 'inactive') Object.assign(where, { isActive: false, deletedAt: null });
  if (filter.status === 'deleted') where.deletedAt = { not: null };
  if (filter.search) {
    where.OR = [
      { name: { contains: filter.search, mode: 'insensitive' } },
      { slug: { contains: filter.search, mode: 'insensitive' } },
    ];
  }
  return where;
}

function orderOf(sort: AdminSchoolSort): Prisma.SchoolOrderByWithRelationInput[] {
  const direction = sort.startsWith('-') ? 'desc' : 'asc';
  const field = sort.replace(/^-/, '') as 'createdAt' | 'name';
  return [{ [field]: direction }, { id: direction }];
}
