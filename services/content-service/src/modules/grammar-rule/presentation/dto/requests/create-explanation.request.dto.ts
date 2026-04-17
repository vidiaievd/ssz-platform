import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { DifficultyLevel } from '../../../../container/domain/value-objects/difficulty-level.vo.js';

export class CreateExplanationRequestDto {
  @ApiProperty({ example: 'en' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  explanationLanguage!: string;

  @ApiProperty({ example: 'A1', enum: DifficultyLevel })
  @IsEnum(DifficultyLevel)
  minLevel!: DifficultyLevel;

  @ApiProperty({ example: 'A2', enum: DifficultyLevel })
  @IsEnum(DifficultyLevel)
  maxLevel!: DifficultyLevel;

  @ApiProperty({ example: 'Present Tense — English (A1–A2)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  displayTitle!: string;

  @ApiPropertyOptional({ example: 'Beginner guide to the Norwegian present tense.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  displaySummary?: string;

  @ApiProperty({ example: '## The Present Tense\n\nIn Norwegian...' })
  @IsString()
  @IsNotEmpty()
  bodyMarkdown!: string;

  @ApiPropertyOptional({ example: 8, minimum: 1, maximum: 480 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(480)
  estimatedReadingMinutes?: number;
}
