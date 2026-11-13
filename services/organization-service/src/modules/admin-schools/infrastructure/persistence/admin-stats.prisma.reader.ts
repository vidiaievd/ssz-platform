import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type {
  AdminSchoolStatus,
  SchoolKindValue,
} from '../../domain/admin-school.js';
import type { AdminStatsSnapshot, DailyCount, IAdminStatsReader } from '../../domain/admin-stats.js';

/**
 * Raw SQL: "first time a person became a student / teacher" and distinct people across
 * schools are not expressible through the Prisma query API. Enum values are literals in the
 * SQL (a bound parameter is text and does not compare with an enum column); the period is
 * bound as an ISO string cast to `timestamp`, the columns being UTC without a zone.
 */
@Injectable()
export class AdminStatsPrismaReader implements IAdminStatsReader {
  constructor(private readonly prisma: PrismaService) {}

  async snapshot(start: Date, end: Date): Promise<AdminStatsSnapshot> {
    const from = start.toISOString();
    const to = end.toISOString();

    const [schools, students, teachers, schoolDays, studentDays, teacherDays] = await Promise.all([
      this.prisma.$queryRaw<{ kind: SchoolKindValue; status: AdminSchoolStatus; count: number }[]>`
        SELECT kind::text AS kind,
               CASE WHEN "deletedAt" IS NOT NULL THEN 'deleted'
                    WHEN "isActive" THEN 'active'
                    ELSE 'inactive' END AS status,
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
    ]);

    return {
      schools,
      studentsTotal: students[0]?.count ?? 0,
      teachersTotal: teachers[0]?.count ?? 0,
      daily: { schools: schoolDays, students: studentDays, teachers: teacherDays },
    };
  }
}
