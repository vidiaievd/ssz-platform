import type { VocabularyExampleTranslation } from '../../../../../../generated/prisma/client.js';
import { VocabularyExampleTranslationEntity } from '../../../domain/entities/vocabulary-example-translation.entity.js';

export interface VocabularyExampleTranslationCreateData {
  id: string;
  vocabularyUsageExampleId: string;
  translationLanguage: string;
  translatedText: string;
  createdAt: Date;
  updatedAt: Date;
}

export type VocabularyExampleTranslationUpdateData = Partial<
  Omit<
    VocabularyExampleTranslationCreateData,
    'id' | 'vocabularyUsageExampleId' | 'translationLanguage' | 'createdAt'
  >
>;

export class VocabularyExampleTranslationMapper {
  static toDomain(raw: VocabularyExampleTranslation): VocabularyExampleTranslationEntity {
    return VocabularyExampleTranslationEntity.reconstitute(raw.id, {
      vocabularyUsageExampleId: raw.vocabularyUsageExampleId,
      translationLanguage: raw.translationLanguage,
      translatedText: raw.translatedText,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    });
  }

  static toCreateData(
    entity: VocabularyExampleTranslationEntity,
  ): VocabularyExampleTranslationCreateData {
    return {
      id: entity.id,
      vocabularyUsageExampleId: entity.vocabularyUsageExampleId,
      translationLanguage: entity.translationLanguage,
      translatedText: entity.translatedText,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  static toUpdateData(
    entity: VocabularyExampleTranslationEntity,
  ): VocabularyExampleTranslationUpdateData {
    return {
      translatedText: entity.translatedText,
      updatedAt: entity.updatedAt,
    };
  }
}
