import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PartOfSpeech } from '../../../domain/value-objects/part-of-speech.vo.js';
import { Register } from '../../../domain/value-objects/register.vo.js';

export class BulkCreateItemRequestDto {
  @ApiProperty({ example: 'hei' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  word: string;

  @ApiPropertyOptional({ example: 'noun', enum: PartOfSpeech })
  @IsOptional()
  @IsEnum(PartOfSpeech)
  partOfSpeech?: PartOfSpeech;

  @ApiPropertyOptional({ example: '/heɪ/' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  ipaTranscription?: string;

  @ApiPropertyOptional({ example: 'uuid-of-audio-file' })
  @IsOptional()
  @IsUUID()
  pronunciationAudioMediaId?: string;

  @ApiPropertyOptional({ example: { gender: 'neuter' } })
  @IsOptional()
  @IsObject()
  grammaticalProperties?: Record<string, unknown>;

  @ApiPropertyOptional({ example: 'informal', enum: Register })
  @IsOptional()
  @IsEnum(Register)
  register?: Register;

  @ApiPropertyOptional({ example: 'Common greeting.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class BulkCreateVocabularyItemsRequestDto {
  @ApiProperty({
    type: [BulkCreateItemRequestDto],
    description: 'List of items to create (max 500 per request)',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BulkCreateItemRequestDto)
  items: BulkCreateItemRequestDto[];
}
