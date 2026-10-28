import { Injectable } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import { aggregateAssistQuality } from '../domain/assist-quality.js';
import type { AssistQualityGroup } from '../domain/assist-quality.js';
import { GetAiAssistQualityQuery } from './get-ai-assist-quality.query.js';

export interface GetAiAssistQualityResult {
  from: string;
  to: string;
  groups: AssistQualityGroup[];
}

@QueryHandler(GetAiAssistQualityQuery)
@Injectable()
export class GetAiAssistQualityHandler
  implements IQueryHandler<GetAiAssistQualityQuery, GetAiAssistQualityResult>
{
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: GetAiAssistQualityQuery): Promise<GetAiAssistQualityResult> {
    const rows = await this.prisma.aiAssistQualityDaily.findMany({
      where: { day: { gte: new Date(`${query.from}T00:00:00Z`), lte: new Date(`${query.to}T00:00:00Z`) } },
      orderBy: [{ capability: 'asc' }, { modelId: 'asc' }, { promptVersion: 'asc' }, { day: 'asc' }],
    });
    return { from: query.from, to: query.to, groups: aggregateAssistQuality(rows) };
  }
}
