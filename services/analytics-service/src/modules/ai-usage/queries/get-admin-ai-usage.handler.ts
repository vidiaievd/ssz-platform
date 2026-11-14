import { Injectable } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { Prisma } from '../../../../generated/prisma/client.js';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import { cutByCapability, cutByPayer, cutByWeek } from '../domain/admin-usage.js';
import type {
  AdminUsageFigures,
  AdminUsageGrouping,
  AdminUsagePayerType,
  AdminUsageSums,
  CapabilityItem,
  PayerCut,
  PayerItem,
  WeekItem,
} from '../domain/admin-usage.js';
import { GetAdminAiUsageQuery } from './get-admin-ai-usage.query.js';

export interface GetAdminAiUsageResult {
  from: string;
  to: string;
  groupBy: AdminUsageGrouping;
  payerType: AdminUsagePayerType | null;
  total: AdminUsageFigures;
  /** One shape per `groupBy`: capability / payer / week rows. */
  items: CapabilityItem[] | PayerItem[] | WeekItem[];
  /** `groupBy=payer` only: payers that spent anything, and everyone below the top N. */
  payers?: number;
  others?: PayerCut['others'];
}

const SUM = {
  calls: true,
  unpricedCalls: true,
  inputTokens: true,
  outputTokens: true,
  cacheReadTokens: true,
  cacheWriteTokens: true,
  credits: true,
} as const;

interface SumRow {
  _sum: {
    calls: number | null;
    unpricedCalls: number | null;
    inputTokens: bigint | null;
    outputTokens: bigint | null;
    cacheReadTokens: bigint | null;
    cacheWriteTokens: bigint | null;
    credits: Prisma.Decimal | null;
  };
}

function sums(row: SumRow): AdminUsageSums {
  return {
    calls: row._sum.calls ?? 0,
    unpricedCalls: row._sum.unpricedCalls ?? 0,
    inputTokens: row._sum.inputTokens ?? 0n,
    outputTokens: row._sum.outputTokens ?? 0n,
    cacheReadTokens: row._sum.cacheReadTokens ?? 0n,
    cacheWriteTokens: row._sum.cacheWriteTokens ?? 0n,
    credits: row._sum.credits?.toFixed(6) ?? '0.000000',
  };
}

/**
 * AI spend per payer over `ai_usage_daily` for the admin panel (plan 90, phase 7, step 12).
 * The database sums by the one dimension asked for; the fold, top N and empty weeks are domain.
 */
@QueryHandler(GetAdminAiUsageQuery)
@Injectable()
export class GetAdminAiUsageHandler implements IQueryHandler<GetAdminAiUsageQuery, GetAdminAiUsageResult> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: GetAdminAiUsageQuery): Promise<GetAdminAiUsageResult> {
    const where: Prisma.AiUsageDailyWhereInput = {
      day: { gte: new Date(`${query.from}T00:00:00Z`), lte: new Date(`${query.to}T00:00:00Z`) },
      ...(query.payerType ? { payerType: query.payerType } : {}),
    };
    const head = { from: query.from, to: query.to, groupBy: query.groupBy, payerType: query.payerType };

    switch (query.groupBy) {
      case 'capability': {
        const rows = await this.prisma.aiUsageDaily.groupBy({ by: ['capability'], where, _sum: SUM });
        const cut = cutByCapability(rows.map((row) => ({ capability: row.capability, ...sums(row) })));
        return { ...head, ...cut };
      }
      case 'payer': {
        const rows = await this.prisma.aiUsageDaily.groupBy({ by: ['payerType', 'payerId'], where, _sum: SUM });
        const cut = cutByPayer(
          rows.map((row) => ({ payerType: row.payerType, payerId: row.payerId, ...sums(row) })),
          query.limit,
        );
        return { ...head, ...cut };
      }
      case 'week': {
        const rows = await this.prisma.aiUsageDaily.groupBy({ by: ['day'], where, _sum: SUM });
        const cut = cutByWeek(rows.map((row) => ({ day: row.day, ...sums(row) })), query.from, query.to);
        return { ...head, ...cut };
      }
    }
  }
}
