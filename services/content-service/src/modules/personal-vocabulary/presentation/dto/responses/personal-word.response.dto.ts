import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PartOfSpeech } from '../../../../vocabulary/domain/value-objects/part-of-speech.vo.js';
import type { PersonalWordView } from '../../../domain/repositories/personal-vocabulary.reader.interface.js';
import type { CaptureWordResult } from '../../../application/commands/capture-word/capture-word.handler.js';
import type { LookupWordResult } from '../../../application/queries/lookup-word/lookup-word.handler.js';

export class PersonalWordSourceDto {
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  variantId: string | null;
  @ApiPropertyOptional({ nullable: true })
  paragraphIndex: number | null;
  @ApiPropertyOptional({ nullable: true })
  charStart: number | null;
}

export class PersonalWordDeckDto {
  @ApiProperty({ format: 'uuid' })
  vocabularyListId: string;
  @ApiProperty({ example: '1A — Stillingsannonsen' })
  title: string;
}

export class PersonalWordResponseDto {
  @ApiProperty({ format: 'uuid' })
  entryId: string;

  @ApiProperty({ format: 'uuid', description: 'The vocabulary item — SRS cards are keyed by it' })
  vocabularyItemId: string;

  @ApiProperty({ example: 'nb' })
  targetLanguage: string;

  @ApiProperty({ example: 'komme', description: "The item's word" })
  word: string;

  @ApiProperty({ example: 'kommer', description: 'The form the student selected' })
  surfaceForm: string;

  @ApiPropertyOptional({ enum: PartOfSpeech, nullable: true })
  partOfSpeech: PartOfSpeech | null;

  @ApiPropertyOptional({ example: 'приходить', nullable: true })
  translation: string | null;

  @ApiProperty({ enum: ['pending', 'resolved'], description: 'pending = no translation yet' })
  status: 'pending' | 'resolved';

  @ApiProperty({ description: "True when the word is the student's own and may be edited" })
  ownWord: boolean;

  @ApiPropertyOptional({ nullable: true })
  contextSentence: string | null;

  @ApiPropertyOptional({ type: PersonalWordSourceDto, nullable: true })
  source: PersonalWordSourceDto | null;

  @ApiPropertyOptional({
    type: PersonalWordDeckDto,
    nullable: true,
    description: 'The unit deck the word joins; null when it lives in «My words» alone',
  })
  deck: PersonalWordDeckDto | null;

  @ApiProperty()
  createdAt: string;

  static from(view: PersonalWordView): PersonalWordResponseDto {
    const dto = new PersonalWordResponseDto();
    dto.entryId = view.entryId;
    dto.vocabularyItemId = view.vocabularyItemId;
    dto.targetLanguage = view.targetLanguage;
    dto.word = view.word;
    dto.surfaceForm = view.surfaceForm;
    dto.partOfSpeech = view.partOfSpeech;
    dto.translation = view.translation;
    dto.status = view.translation === null ? 'pending' : 'resolved';
    dto.ownWord = view.ownWord;
    dto.contextSentence = view.contextSentence;
    dto.source =
      view.sourceVariantId === null &&
      view.sourceParagraph === null &&
      view.sourceCharStart === null
        ? null
        : {
            variantId: view.sourceVariantId,
            paragraphIndex: view.sourceParagraph,
            charStart: view.sourceCharStart,
          };
    dto.deck = view.deck;
    dto.createdAt = view.createdAt.toISOString();
    return dto;
  }
}

export class CaptureWordResponseDto {
  @ApiProperty({ type: PersonalWordResponseDto })
  word: PersonalWordResponseDto;

  @ApiProperty({ description: 'False when the word was already in the dictionary' })
  created: boolean;

  static from(result: CaptureWordResult): CaptureWordResponseDto {
    const dto = new CaptureWordResponseDto();
    dto.word = PersonalWordResponseDto.from(result.word);
    dto.created = result.created;
    return dto;
  }
}

export class CatalogWordDto {
  @ApiProperty({ example: 'komme' })
  word: string;
  @ApiPropertyOptional({ enum: PartOfSpeech, nullable: true })
  partOfSpeech: PartOfSpeech | null;
  @ApiPropertyOptional({ example: 'приходить', nullable: true })
  translation: string | null;
}

export class LookupWordResponseDto {
  @ApiProperty({ example: 'kommer', description: 'The form as it will be stored' })
  surfaceForm: string;

  @ApiPropertyOptional({
    type: PersonalWordResponseDto,
    nullable: true,
    description: 'Already in my words',
  })
  entry: PersonalWordResponseDto | null;

  @ApiPropertyOptional({
    type: CatalogWordDto,
    nullable: true,
    description: 'What the course catalogue knows',
  })
  catalog: CatalogWordDto | null;

  static from(result: LookupWordResult): LookupWordResponseDto {
    const dto = new LookupWordResponseDto();
    dto.surfaceForm = result.surfaceForm;
    dto.entry = result.entry ? PersonalWordResponseDto.from(result.entry) : null;
    dto.catalog = result.catalog;
    return dto;
  }
}
