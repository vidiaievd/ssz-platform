import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import {
  IVocabularyExampleTranslationRepository,
  VOCABULARY_EXAMPLE_TRANSLATION_REPOSITORY,
} from '../../domain/repositories/vocabulary-example-translation.repository.interface.js';
import { VocabularyExampleTranslationEntity } from '../../domain/entities/vocabulary-example-translation.entity.js';
import { VocabularyExampleTranslationMapper } from './mappers/vocabulary-example-translation.mapper.js';

export { VOCABULARY_EXAMPLE_TRANSLATION_REPOSITORY };

@Injectable()
export class PrismaVocabularyExampleTranslationRepository implements IVocabularyExampleTranslationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<VocabularyExampleTranslationEntity | null> {
    const raw = await this.prisma.vocabularyExampleTranslation.findUnique({ where: { id } });
    return raw ? VocabularyExampleTranslationMapper.toDomain(raw) : null;
  }

  async findByExampleId(exampleId: string): Promise<VocabularyExampleTranslationEntity[]> {
    const rows = await this.prisma.vocabularyExampleTranslation.findMany({
      where: { vocabularyUsageExampleId: exampleId },
    });
    return rows.map((r) => VocabularyExampleTranslationMapper.toDomain(r));
  }

  async findByExampleAndLanguage(
    exampleId: string,
    translationLanguage: string,
  ): Promise<VocabularyExampleTranslationEntity | null> {
    const raw = await this.prisma.vocabularyExampleTranslation.findUnique({
      where: {
        vocabularyUsageExampleId_translationLanguage: {
          vocabularyUsageExampleId: exampleId,
          translationLanguage,
        },
      },
    });
    return raw ? VocabularyExampleTranslationMapper.toDomain(raw) : null;
  }

  async upsert(
    entity: VocabularyExampleTranslationEntity,
  ): Promise<VocabularyExampleTranslationEntity> {
    const existing = await this.prisma.vocabularyExampleTranslation.findUnique({
      where: {
        vocabularyUsageExampleId_translationLanguage: {
          vocabularyUsageExampleId: entity.vocabularyUsageExampleId,
          translationLanguage: entity.translationLanguage,
        },
      },
      select: { id: true },
    });

    const raw = existing
      ? await this.prisma.vocabularyExampleTranslation.update({
          where: { id: existing.id },
          data: VocabularyExampleTranslationMapper.toUpdateData(entity),
        })
      : await this.prisma.vocabularyExampleTranslation.create({
          data: VocabularyExampleTranslationMapper.toCreateData(entity),
        });

    return VocabularyExampleTranslationMapper.toDomain(raw);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.vocabularyExampleTranslation.delete({ where: { id } });
  }
}
