import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import {
  type AdminSchoolCounts,
  type AdminSchoolDetail,
  type AdminSchoolFilter,
  type AdminSchoolPage,
  type AdminSchoolSort,
  type IAdminSchoolsReader,
  type AdminSchoolSeatsFilter,
} from '../../domain/admin-school.js';
import { seatUsage } from '../../../schools/domain/value-objects/seat-policy.vo.js';

const STAFF_ROLES = ['ADMIN', 'MANAGER', 'CONTENT_ADMIN', 'SCHEDULER'] as const;

/** Every count is one grouped query over the page's ids, so a page costs the same at 5 rows and at 100. */
@Injectable()
export class AdminSchoolsPrismaReader implements IAdminSchoolsReader {
  constructor(private readonly prisma: PrismaService) {}

  async list(filter: AdminSchoolFilter, sort: AdminSchoolSort, page: number, limit: number): Promise<AdminSchoolPage> {
    const where = whereOf(filter);
    if (filter.seats) where.id = { in: await this.schoolIdsBySeats(filter.seats) };
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
          status: true,
          closesAt: true,
          purgeAt: true,
          ownerId: true,
          city: true,
          createdAt: true,
        },
      }),
    ]);

    const ids = rows.map((r) => r.id);
    const [counts, limits] = await Promise.all([this.rosterCounts(ids), this.seatLimits(ids)]);
    return {
      items: rows.map((r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        kind: r.kind,
        status: r.status,
        closesAt: r.closesAt,
        purgeAt: r.purgeAt,
        ownerId: r.ownerId,
        city: r.city,
        createdAt: r.createdAt,
        counts: counts.get(r.id) ?? { students: 0, teachers: 0 },
        seats: { used: counts.get(r.id)?.students ?? 0, limit: limits.get(r.id) ?? null },
      })),
      total,
      page,
      limit,
    };
  }

  async findById(id: string): Promise<(Omit<AdminSchoolDetail, 'owner'> & { ownerId: string }) | null> {
    const school = await this.prisma.school.findUnique({ where: { id } });
    if (!school) return null;

    const [limits, roster, pendingApplications, pendingInvitations, groups] = await Promise.all([
      this.seatLimits([id]),
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

    const students = tally((r) => r.role === 'STUDENT' && r.status === 'active');

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
      status: school.status,
      statusChangedAt: school.statusChangedAt,
      statusReason: school.statusReason,
      closesAt: school.closesAt,
      purgeAt: school.purgeAt,
      description: school.description,
      avatarUrl: school.avatarUrl,
      contacts: { email: school.contactEmail, website: school.website, city: school.city },
      ownerId: school.ownerId,
      createdAt: school.createdAt,
      updatedAt: school.updatedAt,
      deletedAt: school.deletedAt,
      counts: {
        students,
        archivedStudents: tally((r) => r.role === 'STUDENT' && r.status === 'archived'),
        teachers: tally((r) => r.role === 'TEACHER'),
        staff: tally((r) => (STAFF_ROLES as readonly string[]).includes(r.role)),
        pendingApplications,
        pendingInvitations,
      },
      seats: seatUsage(students, limits.get(id) ?? null),
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

  /**
   * The plan's student limit per school from the local projection (rows past their `validUntil`
   * still count — a read for the panel is never worth a call to subscription-service). A school
   * without a row, or with `null`, has no entry: no limit shown.
   */
  private async seatLimits(schoolIds: string[]): Promise<Map<string, number>> {
    if (schoolIds.length === 0) return new Map();
    // The generated client does not type this model (same as SeatLimitPrismaProjection).
    const rows = (await (this.prisma as any).schoolSeatLimit.findMany({
      where: { schoolId: { in: schoolIds }, maxSeats: { not: null } },
      select: { schoolId: true, maxSeats: true },
    })) as { schoolId: string; maxSeats: number }[];
    return new Map(rows.map((r) => [r.schoolId, r.maxSeats]));
  }

  /** Ids of the schools whose roster stands `near` the limit (≥ 90 %, not over) or `over` it. */
  private async schoolIdsBySeats(state: AdminSchoolSeatsFilter): Promise<string[]> {
    const rows =
      state === 'over'
        ? await this.prisma.$queryRaw<{ id: string }[]>`
            SELECT l.school_id::text AS id
              FROM school_seat_limits l
              LEFT JOIN (
                SELECT "schoolId", count(*)::int AS used FROM school_members
                 WHERE role = 'STUDENT' AND status = 'active' GROUP BY 1
              ) u ON u."schoolId" = l.school_id
             WHERE l.max_seats IS NOT NULL AND COALESCE(u.used, 0) > l.max_seats`
        : await this.prisma.$queryRaw<{ id: string }[]>`
            SELECT l.school_id::text AS id
              FROM school_seat_limits l
              LEFT JOIN (
                SELECT "schoolId", count(*)::int AS used FROM school_members
                 WHERE role = 'STUDENT' AND status = 'active' GROUP BY 1
              ) u ON u."schoolId" = l.school_id
             WHERE l.max_seats > 0
               AND COALESCE(u.used, 0) <= l.max_seats
               AND COALESCE(u.used, 0) * 10 >= l.max_seats * 9`;
    return rows.map((r) => r.id);
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
  if (filter.status) where.status = filter.status;
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
