import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import {
  IVocabularyItemTranslationRepository,
  VOCABULARY_ITEM_TRANSLATION_REPOSITORY,
} from '../../domain/repositories/vocabulary-item-translation.repository.interface.js';
import { VocabularyItemTranslationEntity } from '../../domain/entities/vocabulary-item-translation.entity.js';
import { VocabularyItemTranslationMapper } from './mappers/vocabulary-item-translation.mapper.js';

export { VOCABULARY_ITEM_TRANSLATION_REPOSITORY };

@Injectable()
export class PrismaVocabularyItemTranslationRepository implements IVocabularyItemTranslationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<VocabularyItemTranslationEntity | null> {
    const raw = await this.prisma.vocabularyItemTranslation.findUnique({ where: { id } });
    return raw ? VocabularyItemTranslationMapper.toDomain(raw) : null;
  }

  async findByItemId(itemId: string): Promise<VocabularyItemTranslationEntity[]> {
    const rows = await this.prisma.vocabularyItemTranslation.findMany({
      where: { vocabularyItemId: itemId },
    });
    return rows.map((r) => VocabularyItemTranslationMapper.toDomain(r));
  }

  async findByItemAndLanguage(
    itemId: string,
    translationLanguage: string,
  ): Promise<VocabularyItemTranslationEntity | null> {
    const raw = await this.prisma.vocabularyItemTranslation.findUnique({
      where: {
        vocabularyItemId_translationLanguage: { vocabularyItemId: itemId, translationLanguage },
      },
    });
    return raw ? VocabularyItemTranslationMapper.toDomain(raw) : null;
  }

  async upsert(
    entity: VocabularyItemTranslationEntity,
  ): Promise<{ entity: VocabularyItemTranslationEntity; wasCreated: boolean }> {
    const existing = await this.prisma.vocabularyItemTranslation.findUnique({
      where: {
        vocabularyItemId_translationLanguage: {
          vocabularyItemId: entity.vocabularyItemId,
          translationLanguage: entity.translationLanguage,
        },
      },
      select: { id: true },
    });

    const wasCreated = existing === null;
    const createData = VocabularyItemTranslationMapper.toCreateData(entity);

    const raw = wasCreated
      ? await this.prisma.vocabularyItemTranslation.create({ data: createData })
      : await this.prisma.vocabularyItemTranslation.update({
          where: { id: existing.id },
          data: VocabularyItemTranslationMapper.toUpdateData(entity),
        });

    return { entity: VocabularyItemTranslationMapper.toDomain(raw), wasCreated };
  }

  async delete(id: string): Promise<void> {
    await this.prisma.vocabularyItemTranslation.delete({ where: { id } });
  }
}
