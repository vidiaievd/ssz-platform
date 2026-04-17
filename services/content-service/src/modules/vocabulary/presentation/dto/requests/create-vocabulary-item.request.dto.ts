import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { PartOfSpeech } from '../../../domain/value-objects/part-of-speech.vo.js';
import { Register } from '../../../domain/value-objects/register.vo.js';

export class CreateVocabularyItemRequestDto {
  @ApiProperty({ example: 'hei', description: 'The word or phrase to learn' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  word: string;

  @ApiPropertyOptional({ example: 'noun', enum: PartOfSpeech })
  @IsOptional()
  @IsEnum(PartOfSpeech)
  partOfSpeech?: PartOfSpeech;

  @ApiPropertyOptional({ example: '/heɪ/', description: 'IPA phonetic transcription' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  ipaTranscription?: string;

  @ApiPropertyOptional({ example: 'uuid-of-audio-file' })
  @IsOptional()
  @IsUUID()
  pronunciationAudioMediaId?: string;

  @ApiPropertyOptional({
    example: { gender: 'neuter', isCountable: true },
    description: 'Language-specific grammatical properties (freeform JSON)',
  })
  @IsOptional()
  @IsObject()
  grammaticalProperties?: Record<string, unknown>;

  @ApiPropertyOptional({ example: 'informal', enum: Register })
  @IsOptional()
  @IsEnum(Register)
  register?: Register;

  @ApiPropertyOptional({ example: 'Used as a casual greeting.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @ApiPropertyOptional({
    example: 0,
    description: 'Explicit 0-based position; appended at the end if omitted.',
    minimum: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;
}
