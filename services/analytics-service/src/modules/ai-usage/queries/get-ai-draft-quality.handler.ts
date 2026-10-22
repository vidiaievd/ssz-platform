import { Injectable } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import { aggregateDraftQuality } from '../domain/draft-quality.js';
import type { DraftQualityGroup } from '../domain/draft-quality.js';
import { GetAiDraftQualityQuery } from './get-ai-draft-quality.query.js';

export interface GetAiDraftQualityResult {
  from: string;
  to: string;
  groups: DraftQualityGroup[];
}

@QueryHandler(GetAiDraftQualityQuery)
@Injectable()
export class GetAiDraftQualityHandler
  implements IQueryHandler<GetAiDraftQualityQuery, GetAiDraftQualityResult>
{
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: GetAiDraftQualityQuery): Promise<GetAiDraftQualityResult> {
    const rows = await this.prisma.aiDraftQualityDaily.findMany({
      where: { day: { gte: new Date(`${query.from}T00:00:00Z`), lte: new Date(`${query.to}T00:00:00Z`) } },
      orderBy: [{ capability: 'asc' }, { modelId: 'asc' }, { promptVersion: 'asc' }, { day: 'asc' }],
    });
    return { from: query.from, to: query.to, groups: aggregateDraftQuality(rows) };
  }
}
