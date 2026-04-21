import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { DifficultyLevel } from '../../../../container/domain/value-objects/difficulty-level.vo.js';
import { Visibility } from '../../../../container/domain/value-objects/visibility.vo.js';

export class CreateVocabularyListRequestDto {
  @ApiProperty({ example: 'Daily Norwegian', description: 'Title of the vocabulary list' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @ApiProperty({ example: 'no', description: 'BCP-47 language tag of the target language' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  targetLanguage: string;

  @ApiProperty({ example: 'A1', enum: DifficultyLevel })
  @IsEnum(DifficultyLevel)
  difficultyLevel: DifficultyLevel;

  @ApiProperty({ example: 'public', enum: Visibility })
  @IsEnum(Visibility)
  visibility: Visibility;

  @ApiPropertyOptional({ example: 'Common daily vocabulary for beginners.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ example: 'uuid-of-cover-image' })
  @IsOptional()
  @IsUUID()
  coverImageMediaId?: string;

  @ApiPropertyOptional({
    example: 'uuid-of-owner-school',
    description: 'When provided the list belongs to a school; otherwise to the authenticated user.',
  })
  @IsOptional()
  @IsUUID()
  ownerSchoolId?: string;

  @ApiPropertyOptional({
    example: true,
    description: 'Whether new items are automatically added to the SRS queue.',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  autoAddToSrs?: boolean;
}
