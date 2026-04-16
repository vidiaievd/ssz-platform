import type { VocabularyItemTranslation } from '../../../../../../generated/prisma/client.js';
import { VocabularyItemTranslationEntity } from '../../../domain/entities/vocabulary-item-translation.entity.js';

export interface VocabularyItemTranslationCreateData {
  id: string;
  vocabularyItemId: string;
  translationLanguage: string;
  primaryTranslation: string;
  alternativeTranslations: string[];
  definition: string | null;
  usageNotes: string | null;
  falseFriendWarning: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string;
  lastEditedByUserId: string;
}

export type VocabularyItemTranslationUpdateData = Partial<
  Omit<
    VocabularyItemTranslationCreateData,
    'id' | 'vocabularyItemId' | 'translationLanguage' | 'createdAt' | 'createdByUserId'
  >
>;

export class VocabularyItemTranslationMapper {
  static toDomain(raw: VocabularyItemTranslation): VocabularyItemTranslationEntity {
    return VocabularyItemTranslationEntity.reconstitute(raw.id, {
      vocabularyItemId: raw.vocabularyItemId,
      translationLanguage: raw.translationLanguage,
      primaryTranslation: raw.primaryTranslation,
      alternativeTranslations: raw.alternativeTranslations,
      definition: raw.definition,
      usageNotes: raw.usageNotes,
      falseFriendWarning: raw.falseFriendWarning,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      createdByUserId: raw.createdByUserId,
      lastEditedByUserId: raw.lastEditedByUserId,
    });
  }

  static toCreateData(
    entity: VocabularyItemTranslationEntity,
  ): VocabularyItemTranslationCreateData {
    return {
      id: entity.id,
      vocabularyItemId: entity.vocabularyItemId,
      translationLanguage: entity.translationLanguage,
      primaryTranslation: entity.primaryTranslation,
      alternativeTranslations: entity.alternativeTranslations,
      definition: entity.definition,
      usageNotes: entity.usageNotes,
      falseFriendWarning: entity.falseFriendWarning,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      createdByUserId: entity.createdByUserId,
      lastEditedByUserId: entity.lastEditedByUserId,
    };
  }

  static toUpdateData(
    entity: VocabularyItemTranslationEntity,
  ): VocabularyItemTranslationUpdateData {
    return {
      primaryTranslation: entity.primaryTranslation,
      alternativeTranslations: entity.alternativeTranslations,
      definition: entity.definition,
      usageNotes: entity.usageNotes,
      falseFriendWarning: entity.falseFriendWarning,
      updatedAt: entity.updatedAt,
      lastEditedByUserId: entity.lastEditedByUserId,
    };
  }
}
