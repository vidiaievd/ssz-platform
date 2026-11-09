import { Inject } from '@nestjs/common';
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { summariseAdminStats, type AdminStats } from '../../admin-stats.js';
import { ACCOUNT_READER, type IAccountReader } from '../../ports/account.reader.js';
import { GetAdminStatsQuery } from './get-admin-stats.query.js';

const DAY_MS = 86_400_000;

@QueryHandler(GetAdminStatsQuery)
export class GetAdminStatsHandler implements IQueryHandler<GetAdminStatsQuery, AdminStats> {
  constructor(@Inject(ACCOUNT_READER) private readonly reader: IAccountReader) {}

  async execute({ withinDays }: GetAdminStatsQuery): Promise<AdminStats> {
    const now = new Date();
    const horizon = new Date(now.getTime() + withinDays * DAY_MS);
    const rows = await this.reader.statsRows(now, horizon);
    return summariseAdminStats(rows, now, withinDays, horizon);
  }
}
