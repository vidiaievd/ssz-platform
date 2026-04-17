import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VocabularyItemEntity } from '../../../domain/entities/vocabulary-item.entity.js';
import { VocabularyItemTranslationEntity } from '../../../domain/entities/vocabulary-item-translation.entity.js';
import { VocabularyUsageExampleEntity } from '../../../domain/entities/vocabulary-usage-example.entity.js';
import { VocabularyExampleTranslationEntity } from '../../../domain/entities/vocabulary-example-translation.entity.js';

export class VocabularyExampleTranslationResponseDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-...' })
  id!: string;

  @ApiProperty({ example: 'en' })
  language!: string;

  @ApiProperty({ example: 'Hi, how are you?' })
  translatedText!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  static from(entity: VocabularyExampleTranslationEntity): VocabularyExampleTranslationResponseDto {
    const dto = new VocabularyExampleTranslationResponseDto();
    dto.id = entity.id;
    dto.language = entity.translationLanguage;
    dto.translatedText = entity.translatedText;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    return dto;
  }
}

export class VocabularyUsageExampleResponseDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-...' })
  id!: string;

  @ApiProperty({ example: 'Hei, hvordan har du det?' })
  exampleText!: string;

  @ApiProperty({ example: 0 })
  position!: number;

  @ApiPropertyOptional({ example: 'uuid-of-audio' })
  audioMediaId!: string | null;

  @ApiPropertyOptional({ example: 'Standard greeting.' })
  contextNote!: string | null;

  @ApiProperty({ type: [VocabularyExampleTranslationResponseDto] })
  translations!: VocabularyExampleTranslationResponseDto[];

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  static from(entity: VocabularyUsageExampleEntity): VocabularyUsageExampleResponseDto {
    const dto = new VocabularyUsageExampleResponseDto();
    dto.id = entity.id;
    dto.exampleText = entity.exampleText;
    dto.position = entity.position;
    dto.audioMediaId = entity.audioMediaId;
    dto.contextNote = entity.contextNote;
    dto.translations = entity.translations.map((t) => VocabularyExampleTranslationResponseDto.from(t));
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    return dto;
  }
}

export class VocabularyItemTranslationResponseDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-...' })
  id!: string;

  @ApiProperty({ example: 'en' })
  language!: string;

  @ApiProperty({ example: 'hello' })
  primaryTranslation!: string;

  @ApiProperty({ example: ['hi', 'hey'] })
  alternativeTranslations!: string[];

  @ApiPropertyOptional({ example: 'A common greeting.' })
  definition!: string | null;

  @ApiPropertyOptional({ example: 'Used informally.' })
  usageNotes!: string | null;

  @ApiPropertyOptional({ example: 'Not the same as "goodbye".' })
  falseFriendWarning!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  @ApiProperty({ example: 'uuid-of-creator' })
  createdByUserId!: string;

  @ApiProperty({ example: 'uuid-of-editor' })
  lastEditedByUserId!: string;

  static from(entity: VocabularyItemTranslationEntity): VocabularyItemTranslationResponseDto {
    const dto = new VocabularyItemTranslationResponseDto();
    dto.id = entity.id;
    dto.language = entity.translationLanguage;
    dto.primaryTranslation = entity.primaryTranslation;
    dto.alternativeTranslations = entity.alternativeTranslations;
    dto.definition = entity.definition;
    dto.usageNotes = entity.usageNotes;
    dto.falseFriendWarning = entity.falseFriendWarning;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    dto.createdByUserId = entity.createdByUserId;
    dto.lastEditedByUserId = entity.lastEditedByUserId;
    return dto;
  }
}

/**
 * Full item DTO for the authoring endpoint.
 * Includes all translations and usage examples with their translations.
 */
export class VocabularyItemResponseDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-...' })
  id!: string;

  @ApiProperty({ example: 'uuid-of-vocabulary-list' })
  vocabularyListId!: string;

  @ApiProperty({ example: 'hei' })
  word!: string;

  @ApiProperty({ example: 0 })
  position!: number;

  @ApiPropertyOptional({ example: 'noun' })
  partOfSpeech!: string | null;

  @ApiPropertyOptional({ example: '/heɪ/' })
  ipaTranscription!: string | null;

  @ApiPropertyOptional({ example: 'uuid-of-audio' })
  pronunciationAudioMediaId!: string | null;

  @ApiPropertyOptional({ example: { gender: 'neuter' } })
  grammaticalProperties!: Record<string, unknown> | null;

  @ApiPropertyOptional({ example: 'informal' })
  register!: string | null;

  @ApiPropertyOptional({ example: 'Common greeting.' })
  notes!: string | null;

  @ApiProperty({ type: [VocabularyItemTranslationResponseDto] })
  translations!: VocabularyItemTranslationResponseDto[];

  @ApiProperty({ type: [VocabularyUsageExampleResponseDto] })
  usageExamples!: VocabularyUsageExampleResponseDto[];

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  @ApiPropertyOptional()
  deletedAt!: Date | null;

  static from(entity: VocabularyItemEntity): VocabularyItemResponseDto {
    const dto = new VocabularyItemResponseDto();
    dto.id = entity.id;
    dto.vocabularyListId = entity.vocabularyListId;
    dto.word = entity.word;
    dto.position = entity.position;
    dto.partOfSpeech = entity.partOfSpeech;
    dto.ipaTranscription = entity.ipaTranscription;
    dto.pronunciationAudioMediaId = entity.pronunciationAudioMediaId;
    dto.grammaticalProperties = entity.grammaticalProperties;
    dto.register = entity.register;
    dto.notes = entity.notes;
    dto.translations = entity.translations.map((t) => VocabularyItemTranslationResponseDto.from(t));
    dto.usageExamples = entity.usageExamples.map((ex) => VocabularyUsageExampleResponseDto.from(ex));
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    dto.deletedAt = entity.deletedAt;
    return dto;
  }
}
