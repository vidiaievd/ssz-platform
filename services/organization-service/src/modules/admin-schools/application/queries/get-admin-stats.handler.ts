import { Inject } from '@nestjs/common';
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { ADMIN_SCHOOL_STATUSES, type AdminSchoolStatus, type SchoolKindValue } from '../../domain/admin-school.js';
import {
  ADMIN_SEATS_ATTENTION_LIMIT,
  ADMIN_STATS_READER,
  type AdminSeatsAttention,
  fillDays,
  type AdminStats,
  type AdminStatsSnapshot,
  type IAdminStatsReader,
} from '../../domain/admin-stats.js';
import { GetAdminStatsQuery } from './get-admin-stats.query.js';

type AdminStatsSnapshotSeat = AdminStatsSnapshot['seats']['attention'][number];

@QueryHandler(GetAdminStatsQuery)
export class GetAdminStatsHandler implements IQueryHandler<GetAdminStatsQuery, AdminStats> {
  constructor(@Inject(ADMIN_STATS_READER) private readonly reader: IAdminStatsReader) {}

  async execute({ period }: GetAdminStatsQuery): Promise<AdminStats> {
    const snapshot = await this.reader.snapshot(period.start, period.end);

    const byStatus = Object.fromEntries(ADMIN_SCHOOL_STATUSES.map((s) => [s, 0])) as Record<AdminSchoolStatus, number>;
    const byKind: Record<SchoolKindValue, number> = { SCHOOL: 0, SOLO: 0 };
    let total = 0;
    for (const row of snapshot.schools) {
      byStatus[row.status] += row.count;
      byKind[row.kind] += row.count;
      total += row.count;
    }

    const daily = fillDays(period.days, snapshot.daily);
    const sum = (key: 'schools' | 'students' | 'teachers') => daily.reduce((n, d) => n + d[key], 0);

    return {
      from: period.days[0],
      to: period.days[period.days.length - 1],
      schools: { total, byStatus, byKind, createdInPeriod: sum('schools') },
      students: { total: snapshot.studentsTotal, newInPeriod: sum('students') },
      teachers: { total: snapshot.teachersTotal, newInPeriod: sum('teachers') },
      daily,
      seats: {
        used: snapshot.seats.used,
        limit: snapshot.seats.limit,
        schoolsLimited: snapshot.seats.schoolsLimited,
        near: attention(snapshot.seats.attention.filter((s) => !s.over)),
        over: attention(snapshot.seats.attention.filter((s) => s.over)),
      },
    };
  }
}

function attention(rows: AdminStatsSnapshotSeat[]): AdminSeatsAttention {
  return {
    total: rows.length,
    items: rows.slice(0, ADMIN_SEATS_ATTENTION_LIMIT).map(({ over: _over, ...item }) => item),
    truncated: rows.length > ADMIN_SEATS_ATTENTION_LIMIT,
  };
}
