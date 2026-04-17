import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  VocabularyItemDisplayResult,
  ItemTranslationDisplayResult,
  ExampleDisplayResult,
  ExampleTranslationDisplayResult,
} from '../../../application/dto/vocabulary-item-display-result.js';

export class ExampleTranslationDisplayResponseDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-...' })
  id!: string;

  @ApiProperty({ example: 'en' })
  language!: string;

  @ApiProperty({ example: 'Hi, how are you?' })
  translatedText!: string;

  @ApiProperty({ example: false, description: 'True when a fallback language was used' })
  fallbackUsed!: boolean;

  static from(r: ExampleTranslationDisplayResult): ExampleTranslationDisplayResponseDto {
    const dto = new ExampleTranslationDisplayResponseDto();
    dto.id = r.id;
    dto.language = r.language;
    dto.translatedText = r.translatedText;
    dto.fallbackUsed = r.fallbackUsed;
    return dto;
  }
}

export class ExampleDisplayResponseDto {
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

  @ApiPropertyOptional({ type: ExampleTranslationDisplayResponseDto })
  translation!: ExampleTranslationDisplayResponseDto | null;

  @ApiProperty({
    example: false,
    description: 'True when no usable translation is available — show the original text only',
  })
  immersionMode!: boolean;

  static from(r: ExampleDisplayResult): ExampleDisplayResponseDto {
    const dto = new ExampleDisplayResponseDto();
    dto.id = r.id;
    dto.exampleText = r.exampleText;
    dto.position = r.position;
    dto.audioMediaId = r.audioMediaId;
    dto.contextNote = r.contextNote;
    dto.translation = r.translation
      ? ExampleTranslationDisplayResponseDto.from(r.translation)
      : null;
    dto.immersionMode = r.immersionMode;
    return dto;
  }
}

export class ItemTranslationDisplayResponseDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-...' })
  id!: string;

  @ApiProperty({ example: 'en' })
  language!: string;

  @ApiProperty({ example: 'hello' })
  primaryTranslation!: string;

  @ApiProperty({ example: ['hi', 'hey'] })
  alternativeTranslations!: string[];

  @ApiPropertyOptional({ example: 'A common informal greeting.' })
  definition!: string | null;

  @ApiPropertyOptional({ example: 'Avoid in formal settings.' })
  usageNotes!: string | null;

  @ApiPropertyOptional({ example: 'Not the same as "goodbye".' })
  falseFriendWarning!: string | null;

  @ApiProperty({ example: false, description: 'True when a fallback language was used' })
  fallbackUsed!: boolean;

  static from(r: ItemTranslationDisplayResult): ItemTranslationDisplayResponseDto {
    const dto = new ItemTranslationDisplayResponseDto();
    dto.id = r.id;
    dto.language = r.language;
    dto.primaryTranslation = r.primaryTranslation;
    dto.alternativeTranslations = r.alternativeTranslations;
    dto.definition = r.definition;
    dto.usageNotes = r.usageNotes;
    dto.falseFriendWarning = r.falseFriendWarning;
    dto.fallbackUsed = r.fallbackUsed;
    return dto;
  }
}

export class VocabularyItemDisplayResponseDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-...' })
  itemId!: string;

  @ApiProperty({ example: 'uuid-of-vocabulary-list' })
  listId!: string;

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

  @ApiPropertyOptional({ type: ItemTranslationDisplayResponseDto })
  translation!: ItemTranslationDisplayResponseDto | null;

  @ApiProperty({
    example: false,
    description: 'True when no usable translation is available — display word in target language only',
  })
  immersionMode!: boolean;

  @ApiProperty({ type: [ExampleDisplayResponseDto] })
  examples!: ExampleDisplayResponseDto[];

  static from(result: VocabularyItemDisplayResult): VocabularyItemDisplayResponseDto {
    const dto = new VocabularyItemDisplayResponseDto();
    dto.itemId = result.itemId;
    dto.listId = result.listId;
    dto.word = result.word;
    dto.position = result.position;
    dto.partOfSpeech = result.partOfSpeech;
    dto.ipaTranscription = result.ipaTranscription;
    dto.pronunciationAudioMediaId = result.pronunciationAudioMediaId;
    dto.grammaticalProperties = result.grammaticalProperties;
    dto.register = result.register;
    dto.notes = result.notes;
    dto.translation = result.translation
      ? ItemTranslationDisplayResponseDto.from(result.translation)
      : null;
    dto.immersionMode = result.immersionMode;
    dto.examples = result.examples.map((ex) => ExampleDisplayResponseDto.from(ex));
    return dto;
  }
}
