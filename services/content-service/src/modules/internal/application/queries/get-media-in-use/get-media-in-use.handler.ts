import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service.js';
import { GetMediaInUseQuery } from './get-media-in-use.query.js';

/**
 * media-service asks before it removes a replaced narration (plan 74, D5). Any variant of
 * any lesson version counts — a draft, the published version, or an older published one a
 * student may still be reading — so an id is "free" only when no body names it at all.
 * `lesson_variant_media_refs` is rebuilt from the body on every save, so it is the answer.
 */
@QueryHandler(GetMediaInUseQuery)
export class GetMediaInUseHandler implements IQueryHandler<GetMediaInUseQuery, string[]> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: GetMediaInUseQuery): Promise<string[]> {
    if (query.assetIds.length === 0) return [];
    const rows = await this.prisma.lessonVariantMediaRef.findMany({
      where: { mediaId: { in: [...query.assetIds] } },
      select: { mediaId: true },
      distinct: ['mediaId'],
    });
    return rows.map((row) => row.mediaId);
  }
}
