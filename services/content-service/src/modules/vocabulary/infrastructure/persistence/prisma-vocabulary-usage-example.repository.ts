import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import {
  IVocabularyUsageExampleRepository,
  VOCABULARY_USAGE_EXAMPLE_REPOSITORY,
} from '../../domain/repositories/vocabulary-usage-example.repository.interface.js';
import { VocabularyUsageExampleEntity } from '../../domain/entities/vocabulary-usage-example.entity.js';
import { VocabularyExampleTranslationMapper } from './mappers/vocabulary-example-translation.mapper.js';
import { VocabularyUsageExampleMapper } from './mappers/vocabulary-usage-example.mapper.js';

export { VOCABULARY_USAGE_EXAMPLE_REPOSITORY };

@Injectable()
export class PrismaVocabularyUsageExampleRepository implements IVocabularyUsageExampleRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<VocabularyUsageExampleEntity | null> {
    const raw = await this.prisma.vocabularyUsageExample.findUnique({
      where: { id },
      include: { translations: true },
    });
    if (!raw) return null;
    const translations = raw.translations.map((t) =>
      VocabularyExampleTranslationMapper.toDomain(t),
    );
    return VocabularyUsageExampleMapper.toDomain(raw, translations);
  }

  async findByItemId(itemId: string): Promise<VocabularyUsageExampleEntity[]> {
    const rows = await this.prisma.vocabularyUsageExample.findMany({
      where: { vocabularyItemId: itemId },
      orderBy: { position: 'asc' },
      include: { translations: true },
    });
    return rows.map((raw) => {
      const translations = raw.translations.map((t) =>
        VocabularyExampleTranslationMapper.toDomain(t),
      );
      return VocabularyUsageExampleMapper.toDomain(raw, translations);
    });
  }

  /**
   * Fetches all examples for the given item IDs, then randomises in Node per item.
   * Acceptable at current scale (examples per item is typically small, ≤20).
   * TODO: consider a Postgres-side ORDER BY random() LATERAL JOIN if the average
   * examples-per-item count grows significantly.
   */
  async findRandomForItems(
    itemIds: string[],
    limit: number,
  ): Promise<Map<string, VocabularyUsageExampleEntity[]>> {
    if (itemIds.length === 0) return new Map();

    const rows = await this.prisma.vocabularyUsageExample.findMany({
      where: { vocabularyItemId: { in: itemIds } },
      include: { translations: true },
    });

    // Group by itemId
    const grouped = new Map<string, typeof rows>();
    for (const row of rows) {
      const existing = grouped.get(row.vocabularyItemId) ?? [];
      existing.push(row);
      grouped.set(row.vocabularyItemId, existing);
    }

    const result = new Map<string, VocabularyUsageExampleEntity[]>();
    for (const [itemId, itemRows] of grouped) {
      // Fisher-Yates shuffle, then take up to `limit`
      const shuffled = [...itemRows];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      const selected = shuffled.slice(0, limit).map((raw) => {
        const translations = raw.translations.map((t) =>
          VocabularyExampleTranslationMapper.toDomain(t),
        );
        return VocabularyUsageExampleMapper.toDomain(raw, translations);
      });
      result.set(itemId, selected);
    }

    return result;
  }

  async save(entity: VocabularyUsageExampleEntity): Promise<VocabularyUsageExampleEntity> {
    const exists = await this.prisma.vocabularyUsageExample.findUnique({
      where: { id: entity.id },
      select: { id: true },
    });

    const raw = exists
      ? await this.prisma.vocabularyUsageExample.update({
          where: { id: entity.id },
          data: VocabularyUsageExampleMapper.toUpdateData(entity),
          include: { translations: true },
        })
      : await this.prisma.vocabularyUsageExample.create({
          data: VocabularyUsageExampleMapper.toCreateData(entity),
          include: { translations: true },
        });

    const translations = raw.translations.map((t) =>
      VocabularyExampleTranslationMapper.toDomain(t),
    );
    return VocabularyUsageExampleMapper.toDomain(raw, translations);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.vocabularyUsageExample.delete({ where: { id } });
  }

  async getMaxPosition(itemId: string): Promise<number> {
    const result = await this.prisma.vocabularyUsageExample.aggregate({
      where: { vocabularyItemId: itemId },
      _max: { position: true },
    });
    return result._max.position ?? -1;
  }
}
