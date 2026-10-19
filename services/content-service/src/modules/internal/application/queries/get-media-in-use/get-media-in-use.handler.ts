import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service.js';
import { GetMediaInUseQuery } from './get-media-in-use.query.js';

/**
 * media-service asks before it removes an asset: a replaced narration (plan 74, D5) or an
 * orphaned upload (plan 76, phase 5). An id is "free" only when nothing in content names it:
 *
 *  - any variant of any lesson version — a draft, the published version, or an older published
 *    one a student may still be reading. `lesson_variant_media_refs` is rebuilt from the body
 *    on every save, so it is the answer for bodies;
 *  - a cover image of a container, a lesson or a vocabulary list;
 *  - a word's pronunciation or a usage example's audio.
 *
 * Soft-deleted rows count too: they can be restored, and their file with them.
 */
@QueryHandler(GetMediaInUseQuery)
export class GetMediaInUseHandler implements IQueryHandler<GetMediaInUseQuery, string[]> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: GetMediaInUseQuery): Promise<string[]> {
    if (query.assetIds.length === 0) return [];
    const ids = [...query.assetIds];

    const [bodies, containers, lessons, lists, words, examples] = await Promise.all([
      this.prisma.lessonVariantMediaRef.findMany({
        where: { mediaId: { in: ids } },
        select: { mediaId: true },
        distinct: ['mediaId'],
      }),
      this.prisma.container.findMany({
        where: { coverImageMediaId: { in: ids } },
        select: { coverImageMediaId: true },
      }),
      this.prisma.lesson.findMany({
        where: { coverImageMediaId: { in: ids } },
        select: { coverImageMediaId: true },
      }),
      this.prisma.vocabularyList.findMany({
        where: { coverImageMediaId: { in: ids } },
        select: { coverImageMediaId: true },
      }),
      this.prisma.vocabularyItem.findMany({
        where: { pronunciationAudioMediaId: { in: ids } },
        select: { pronunciationAudioMediaId: true },
      }),
      this.prisma.vocabularyUsageExample.findMany({
        where: { audioMediaId: { in: ids } },
        select: { audioMediaId: true },
      }),
    ]);

    const named = new Set<string>();
    for (const row of bodies) named.add(row.mediaId);
    for (const row of [...containers, ...lessons, ...lists])
      if (row.coverImageMediaId) named.add(row.coverImageMediaId);
    for (const row of words)
      if (row.pronunciationAudioMediaId) named.add(row.pronunciationAudioMediaId);
    for (const row of examples) if (row.audioMediaId) named.add(row.audioMediaId);
    return [...named];
  }
}
