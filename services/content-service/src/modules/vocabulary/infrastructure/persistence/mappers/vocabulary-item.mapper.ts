import type { VocabularyItem } from '../../../../../../generated/prisma/client.js';
import { $Enums, Prisma } from '../../../../../../generated/prisma/client.js';
import { VocabularyItemEntity } from '../../../domain/entities/vocabulary-item.entity.js';
import { VocabularyItemTranslationEntity } from '../../../domain/entities/vocabulary-item-translation.entity.js';
import { VocabularyUsageExampleEntity } from '../../../domain/entities/vocabulary-usage-example.entity.js';
import {
  prismaPartOfSpeechToDomain,
  domainPartOfSpeechToPrisma,
  prismaRegisterToDomain,
  domainRegisterToPrisma,
} from './enum-converters.js';

export interface VocabularyItemCreateData {
  id: string;
  vocabularyListId: string;
  word: string;
  position: number;
  partOfSpeech: $Enums.PartOfSpeech | null;
  ipaTranscription: string | null;
  pronunciationAudioMediaId: string | null;
  grammaticalProperties: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
  register: $Enums.Register | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export type VocabularyItemUpdateData = Partial<
  Omit<VocabularyItemCreateData, 'id' | 'vocabularyListId' | 'createdAt'>
>;

export class VocabularyItemMapper {
  static toDomain(
    raw: VocabularyItem,
    translations: VocabularyItemTranslationEntity[] = [],
    usageExamples: VocabularyUsageExampleEntity[] = [],
  ): VocabularyItemEntity {
    return VocabularyItemEntity.reconstitute(
      raw.id,
      {
        vocabularyListId: raw.vocabularyListId,
        word: raw.word,
        position: raw.position,
        partOfSpeech: raw.partOfSpeech ? prismaPartOfSpeechToDomain(raw.partOfSpeech) : null,
        ipaTranscription: raw.ipaTranscription,
        pronunciationAudioMediaId: raw.pronunciationAudioMediaId,
        // grammaticalProperties is Prisma.JsonValue (object | array | scalar | null).
        // We only store objects; cast safely — validate-on-read is not required (validated on write).
        grammaticalProperties: raw.grammaticalProperties as Record<string, unknown> | null,
        register: raw.register ? prismaRegisterToDomain(raw.register) : null,
        notes: raw.notes,
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt,
        deletedAt: raw.deletedAt,
      },
      translations,
      usageExamples,
    );
  }

  static toCreateData(entity: VocabularyItemEntity): VocabularyItemCreateData {
    return {
      id: entity.id,
      vocabularyListId: entity.vocabularyListId,
      word: entity.word,
      position: entity.position,
      partOfSpeech: entity.partOfSpeech ? domainPartOfSpeechToPrisma(entity.partOfSpeech) : null,
      ipaTranscription: entity.ipaTranscription,
      pronunciationAudioMediaId: entity.pronunciationAudioMediaId,
      grammaticalProperties: (entity.grammaticalProperties ?? Prisma.JsonNull) as
        | Prisma.InputJsonValue
        | Prisma.NullableJsonNullValueInput,
      register: entity.register ? domainRegisterToPrisma(entity.register) : null,
      notes: entity.notes,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      deletedAt: entity.deletedAt,
    };
  }

  static toUpdateData(entity: VocabularyItemEntity): VocabularyItemUpdateData {
    return {
      word: entity.word,
      position: entity.position,
      partOfSpeech: entity.partOfSpeech ? domainPartOfSpeechToPrisma(entity.partOfSpeech) : null,
      ipaTranscription: entity.ipaTranscription,
      pronunciationAudioMediaId: entity.pronunciationAudioMediaId,
      grammaticalProperties: (entity.grammaticalProperties ?? Prisma.JsonNull) as
        | Prisma.InputJsonValue
        | Prisma.NullableJsonNullValueInput,
      register: entity.register ? domainRegisterToPrisma(entity.register) : null,
      notes: entity.notes,
      updatedAt: entity.updatedAt,
      deletedAt: entity.deletedAt,
    };
  }
}
