import { Injectable } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import { aggregateAiUsage } from '../domain/usage-aggregate.js';
import type { AiUsageGroup } from '../domain/usage-aggregate.js';
import { GetAiUsageQuery } from './get-ai-usage.query.js';

export interface GetAiUsageResult {
  from: string;
  to: string;
  groupBy: readonly string[];
  groups: AiUsageGroup[];
}

@QueryHandler(GetAiUsageQuery)
@Injectable()
export class GetAiUsageHandler implements IQueryHandler<GetAiUsageQuery, GetAiUsageResult> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: GetAiUsageQuery): Promise<GetAiUsageResult> {
    const rows = await this.prisma.aiUsageDaily.findMany({
      where: { day: { gte: new Date(`${query.from}T00:00:00Z`), lte: new Date(`${query.to}T00:00:00Z`) } },
      // Groups keep the order of their first row, so a fixed row order is a stable answer.
      orderBy: [{ day: 'asc' }, { capability: 'asc' }, { payerType: 'asc' }, { payerId: 'asc' }],
    });

    const groups = aggregateAiUsage(
      rows.map((row) => ({ ...row, credits: row.credits.toFixed(6) })),
      query.groupBy,
    );
    return { from: query.from, to: query.to, groupBy: query.groupBy, groups };
  }
}
