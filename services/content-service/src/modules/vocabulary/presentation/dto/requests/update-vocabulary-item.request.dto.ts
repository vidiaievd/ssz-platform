import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { PartOfSpeech } from '../../../domain/value-objects/part-of-speech.vo.js';
import { Register } from '../../../domain/value-objects/register.vo.js';

export class UpdateVocabularyItemRequestDto {
  @ApiPropertyOptional({ example: 'takk', description: 'Updated word or phrase' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  word?: string;

  @ApiPropertyOptional({ example: 'noun', enum: PartOfSpeech, nullable: true })
  @IsOptional()
  @ValidateIf((o) => o.partOfSpeech !== null)
  @IsEnum(PartOfSpeech)
  partOfSpeech?: PartOfSpeech | null;

  @ApiPropertyOptional({ example: '/tɑk/', nullable: true })
  @IsOptional()
  @ValidateIf((o) => o.ipaTranscription !== null)
  @IsString()
  @MaxLength(200)
  ipaTranscription?: string | null;

  @ApiPropertyOptional({ example: 'uuid-of-audio-file', nullable: true })
  @IsOptional()
  @ValidateIf((o) => o.pronunciationAudioMediaId !== null)
  @IsUUID()
  pronunciationAudioMediaId?: string | null;

  @ApiPropertyOptional({ example: { gender: 'neuter' }, nullable: true })
  @IsOptional()
  @ValidateIf((o) => o.grammaticalProperties !== null)
  @IsObject()
  grammaticalProperties?: Record<string, unknown> | null;

  @ApiPropertyOptional({ example: 'informal', enum: Register, nullable: true })
  @IsOptional()
  @ValidateIf((o) => o.register !== null)
  @IsEnum(Register)
  register?: Register | null;

  @ApiPropertyOptional({ example: 'Used to express gratitude.', nullable: true })
  @IsOptional()
  @ValidateIf((o) => o.notes !== null)
  @IsString()
  @MaxLength(1000)
  notes?: string | null;
}
