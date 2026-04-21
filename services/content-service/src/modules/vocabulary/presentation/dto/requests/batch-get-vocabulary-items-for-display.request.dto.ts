import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class BatchGetVocabularyItemsForDisplayRequestDto {
  @ApiProperty({
    example: ['uuid-1', 'uuid-2'],
    description: 'IDs of vocabulary items to fetch (max 200)',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  vocabularyItemIds: string[];

  @ApiProperty({ example: 'en', description: 'BCP-47 tag of the preferred translation language' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  translationLanguage: string;

  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional()
  @IsBoolean()
  includeExamples?: boolean;

  @ApiPropertyOptional({ example: 3, minimum: 1, maximum: 20, default: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  examplesLimit?: number;

  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional()
  @IsBoolean()
  examplesRandom?: boolean;

  @ApiPropertyOptional({ example: ['ru', 'de'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  studentKnownLanguages?: string[];
}
