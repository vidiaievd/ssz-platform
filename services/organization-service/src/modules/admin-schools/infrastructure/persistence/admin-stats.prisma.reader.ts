import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type {
  AdminSchoolStatus,
  SchoolKindValue,
} from '../../domain/admin-school.js';
import {
  ADMIN_LIFECYCLE_WINDOW_DAYS,
  type AdminLifecycleAttentionItem,
  type AdminStatsSnapshot,
  type DailyCount,
  type IAdminStatsReader,
} from '../../domain/admin-stats.js';

/**
 * Raw SQL: "first time a person became a student / teacher" and distinct people across
 * schools are not expressible through the Prisma query API. Enum values are literals in the
 * SQL (a bound parameter is text and does not compare with an enum column); the period is
 * bound as an ISO string cast to `timestamp`, the columns being UTC without a zone.
 */
@Injectable()
export class AdminStatsPrismaReader implements IAdminStatsReader {
  constructor(private readonly prisma: PrismaService) {}

  async snapshot(start: Date, end: Date, now: Date): Promise<AdminStatsSnapshot> {
    const from = start.toISOString();
    const to = end.toISOString();
    const horizon = new Date(now.getTime() + ADMIN_LIFECYCLE_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const [schools, students, teachers, schoolDays, studentDays, teacherDays, seatTotals, attention, closing, purging] =
      await Promise.all([
      this.prisma.$queryRaw<{ kind: SchoolKindValue; status: AdminSchoolStatus; count: number }[]>`
        SELECT kind::text AS kind,
               status::text AS status,
               count(*)::int AS count
          FROM schools
         GROUP BY 1, 2`,
      this.prisma.$queryRaw<{ count: number }[]>`
        SELECT count(DISTINCT m."userId")::int AS count
          FROM school_members m
          JOIN schools s ON s.id = m."schoolId"
         WHERE s."deletedAt" IS NULL AND m.role = 'STUDENT' AND m.status = 'active'`,
      this.prisma.$queryRaw<{ count: number }[]>`
        SELECT count(*)::int AS count FROM (
          SELECT m."userId" AS user_id
            FROM school_members m
            JOIN schools s ON s.id = m."schoolId"
           WHERE s."deletedAt" IS NULL AND m.role = 'TEACHER'
          UNION
          SELECT s."ownerId" FROM schools s WHERE s."deletedAt" IS NULL AND s.kind = 'SOLO'
        ) t`,
      this.prisma.$queryRaw<DailyCount[]>`
        SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS day, count(*)::int AS count
          FROM schools
         WHERE "createdAt" >= ${from}::timestamp AND "createdAt" < ${to}::timestamp
         GROUP BY 1`,
      this.prisma.$queryRaw<DailyCount[]>`
        SELECT to_char(date_trunc('day', first_at), 'YYYY-MM-DD') AS day, count(*)::int AS count
          FROM (
            SELECT m."userId", min(m."joinedAt") AS first_at
              FROM school_members m
              JOIN schools s ON s.id = m."schoolId"
             WHERE s."deletedAt" IS NULL AND m.role = 'STUDENT'
             GROUP BY m."userId"
          ) f
         WHERE first_at >= ${from}::timestamp AND first_at < ${to}::timestamp
         GROUP BY 1`,
      this.prisma.$queryRaw<DailyCount[]>`
        SELECT to_char(date_trunc('day', first_at), 'YYYY-MM-DD') AS day, count(*)::int AS count
          FROM (
            SELECT user_id, min(at) AS first_at FROM (
              SELECT m."userId" AS user_id, m."joinedAt" AS at
                FROM school_members m
                JOIN schools s ON s.id = m."schoolId"
               WHERE s."deletedAt" IS NULL AND m.role = 'TEACHER'
              UNION ALL
              SELECT s."ownerId", s."createdAt" FROM schools s WHERE s."deletedAt" IS NULL AND s.kind = 'SOLO'
            ) t
            GROUP BY user_id
          ) f
         WHERE first_at >= ${from}::timestamp AND first_at < ${to}::timestamp
         GROUP BY 1`,
      this.prisma.$queryRaw<{ used: number; limit: number; schools_limited: number }[]>`
        SELECT COALESCE(sum(COALESCE(u.used, 0)), 0)::int AS used,
               COALESCE(sum(l.max_seats), 0)::int AS "limit",
               count(*)::int AS schools_limited
          FROM school_seat_limits l
          JOIN schools s ON s.id = l.school_id AND s."deletedAt" IS NULL
          LEFT JOIN (
            SELECT "schoolId", count(*)::int AS used FROM school_members
             WHERE role = 'STUDENT' AND status = 'active' GROUP BY 1
          ) u ON u."schoolId" = l.school_id
         WHERE l.max_seats IS NOT NULL`,
      this.prisma.$queryRaw<
        { school_id: string; name: string; slug: string; used: number; limit: number; over: boolean }[]
      >`
        SELECT s.id::text AS school_id, s.name, s.slug, COALESCE(u.used, 0)::int AS used,
               l.max_seats AS "limit", COALESCE(u.used, 0) > l.max_seats AS over
          FROM school_seat_limits l
          JOIN schools s ON s.id = l.school_id AND s."deletedAt" IS NULL
          LEFT JOIN (
            SELECT "schoolId", count(*)::int AS used FROM school_members
             WHERE role = 'STUDENT' AND status = 'active' GROUP BY 1
          ) u ON u."schoolId" = l.school_id
         WHERE l.max_seats IS NOT NULL
           AND (COALESCE(u.used, 0) > l.max_seats
                OR (l.max_seats > 0 AND COALESCE(u.used, 0) * 10 >= l.max_seats * 9))
         ORDER BY COALESCE(u.used, 0)::float / GREATEST(l.max_seats, 1) DESC, s.id`,
      this.prisma.school.findMany({
        where: { status: 'suspended', closesAt: { lte: horizon } },
        orderBy: [{ closesAt: 'asc' }, { id: 'asc' }],
        select: { id: true, name: true, slug: true, kind: true, closesAt: true },
      }),
      this.prisma.school.findMany({
        where: { status: 'closed', purgeAt: { lte: horizon } },
        orderBy: [{ purgeAt: 'asc' }, { id: 'asc' }],
        select: { id: true, name: true, slug: true, kind: true, purgeAt: true },
      }),
    ]);

    const item = (r: { id: string; name: string; slug: string; kind: SchoolKindValue }, at: Date | null) =>
      ({ schoolId: r.id, name: r.name, slug: r.slug, kind: r.kind, at: at! }) satisfies AdminLifecycleAttentionItem;

    return {
      schools,
      studentsTotal: students[0]?.count ?? 0,
      teachersTotal: teachers[0]?.count ?? 0,
      daily: { schools: schoolDays, students: studentDays, teachers: teacherDays },
      seats: {
        used: seatTotals[0]?.used ?? 0,
        limit: seatTotals[0]?.limit ?? 0,
        schoolsLimited: seatTotals[0]?.schools_limited ?? 0,
        attention: attention.map((r) => ({
          schoolId: r.school_id,
          name: r.name,
          slug: r.slug,
          used: r.used,
          limit: r.limit,
          over: r.over,
        })),
      },
      lifecycle: {
        closingSoon: closing.map((r) => item(r, r.closesAt)),
        purgingSoon: purging.map((r) => item(r, r.purgeAt)),
      },
    };
  }
}
