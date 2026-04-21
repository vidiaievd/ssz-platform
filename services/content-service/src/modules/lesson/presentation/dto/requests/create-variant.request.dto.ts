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

export class CreateVariantRequestDto {
  @ApiProperty({
    example: 'en',
    description: 'BCP-47 language tag of the explanation language used in this variant.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  explanationLanguage: string;

  @ApiProperty({ example: 'A1', enum: DifficultyLevel })
  @IsEnum(DifficultyLevel)
  minLevel: DifficultyLevel;

  @ApiProperty({ example: 'A2', enum: DifficultyLevel })
  @IsEnum(DifficultyLevel)
  maxLevel: DifficultyLevel;

  @ApiProperty({ example: 'Greetings — English explanation' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  displayTitle: string;

  @ApiPropertyOptional({ example: 'Beginner-friendly English explanation of Norwegian greetings.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  displayDescription?: string;

  @ApiProperty({ example: '## Hei!\n\nIn Norwegian, **hei** means hello...' })
  @IsString()
  @IsNotEmpty()
  bodyMarkdown: string;

  @ApiPropertyOptional({ example: 5, minimum: 1, maximum: 480 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(480)
  estimatedReadingMinutes?: number;
}
