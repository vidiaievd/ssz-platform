import type { VocabularyUsageExample } from '../../../../../../generated/prisma/client.js';
import { VocabularyUsageExampleEntity } from '../../../domain/entities/vocabulary-usage-example.entity.js';
import { VocabularyExampleTranslationEntity } from '../../../domain/entities/vocabulary-example-translation.entity.js';

export interface VocabularyUsageExampleCreateData {
  id: string;
  vocabularyItemId: string;
  exampleText: string;
  position: number;
  audioMediaId: string | null;
  contextNote: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type VocabularyUsageExampleUpdateData = Partial<
  Omit<VocabularyUsageExampleCreateData, 'id' | 'vocabularyItemId' | 'createdAt'>
>;

export class VocabularyUsageExampleMapper {
  static toDomain(
    raw: VocabularyUsageExample,
    translations: VocabularyExampleTranslationEntity[] = [],
  ): VocabularyUsageExampleEntity {
    return VocabularyUsageExampleEntity.reconstitute(
      raw.id,
      {
        vocabularyItemId: raw.vocabularyItemId,
        exampleText: raw.exampleText,
        position: raw.position,
        audioMediaId: raw.audioMediaId,
        contextNote: raw.contextNote,
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt,
      },
      translations,
    );
  }

  static toCreateData(entity: VocabularyUsageExampleEntity): VocabularyUsageExampleCreateData {
    return {
      id: entity.id,
      vocabularyItemId: entity.vocabularyItemId,
      exampleText: entity.exampleText,
      position: entity.position,
      audioMediaId: entity.audioMediaId,
      contextNote: entity.contextNote,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  static toUpdateData(entity: VocabularyUsageExampleEntity): VocabularyUsageExampleUpdateData {
    return {
      exampleText: entity.exampleText,
      position: entity.position,
      audioMediaId: entity.audioMediaId,
      contextNote: entity.contextNote,
      updatedAt: entity.updatedAt,
    };
  }
}
