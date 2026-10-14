import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import type { PersonalWordStatus } from '../../../application/queries/list-my-words/list-my-words.query.js';

class TranslationLanguageDto {
  @ApiProperty({
    example: 'ru',
    description: "The student's language — what translations are written in",
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  translationLanguage: string;
}

export class CaptureWordRequestDto extends TranslationLanguageDto {
  @ApiProperty({ example: 'nb', description: 'Language of the text the word was selected in' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  targetLanguage: string;

  @ApiProperty({
    example: 'kommer',
    description: 'The word as selected. One word; edge punctuation is trimmed.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  surfaceForm: string;

  @ApiPropertyOptional({
    example: 'приходит',
    description: "The student's own translation. Omit to save the word as waiting for one.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  translation?: string;

  @ApiPropertyOptional({
    example: 'Bartek kommer fra Polen.',
    description: 'The sentence the word was met in',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  contextSentence?: string;

  // Any UUID version: seeded lessons carry v5 ids.
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Lesson content variant the word was met in',
  })
  @IsOptional()
  @IsUUID('all')
  sourceVariantId?: string;

  @ApiPropertyOptional({ example: 2, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sourceParagraph?: number;

  @ApiPropertyOptional({ example: 7, minimum: 0, description: 'UTF-16 offset in the paragraph' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sourceCharStart?: number;
}

export class UpdateMyWordRequestDto extends TranslationLanguageDto {
  @ApiPropertyOptional({
    example: 'komme',
    description: 'A corrected word, e.g. its dictionary form',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  word?: string;

  @ApiPropertyOptional({
    example: 'приходить',
    nullable: true,
    description: 'New translation; null or an empty string removes it. Omit to keep it.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  translation?: string | null;
}

export class LookupWordRequestDto extends TranslationLanguageDto {
  @ApiProperty({ example: 'nb' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  targetLanguage: string;

  @ApiProperty({ example: 'kommer' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  form: string;
}

export class ListMyWordsRequestDto extends TranslationLanguageDto {
  @ApiPropertyOptional({ example: 'nb' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  targetLanguage?: string;

  @ApiPropertyOptional({
    enum: ['pending', 'resolved'],
    description: 'pending = no translation yet',
  })
  @IsOptional()
  @IsIn(['pending', 'resolved'])
  status?: PersonalWordStatus;
}
