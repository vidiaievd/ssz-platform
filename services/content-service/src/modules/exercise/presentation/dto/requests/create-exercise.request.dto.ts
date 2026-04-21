import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { DifficultyLevel } from '../../../../container/domain/value-objects/difficulty-level.vo.js';
import { Visibility } from '../../../../container/domain/value-objects/visibility.vo.js';

export class CreateExerciseRequestDto {
  @ApiProperty({ example: 'uuid-of-exercise-template' })
  @IsUUID()
  exerciseTemplateId!: string;

  @ApiProperty({ example: 'no', description: 'BCP-47 language tag of the target language' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  targetLanguage!: string;

  @ApiProperty({ example: 'A1', enum: DifficultyLevel })
  @IsEnum(DifficultyLevel)
  difficultyLevel!: DifficultyLevel;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'Exercise content — must conform to the template contentSchema.',
  })
  @IsObject()
  content!: Record<string, unknown>;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'Expected answers — must conform to the template answerSchema.',
  })
  @IsObject()
  expectedAnswers!: Record<string, unknown>;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    nullable: true,
    description: 'Overrides for template defaultCheckSettings (shallow merge).',
  })
  @IsOptional()
  @IsObject()
  answerCheckSettings?: Record<string, unknown>;

  @ApiProperty({ example: 'public', enum: Visibility })
  @IsEnum(Visibility)
  visibility!: Visibility;

  @ApiPropertyOptional({ example: 'uuid-of-owner-school' })
  @IsOptional()
  @IsUUID()
  ownerSchoolId?: string;

  @ApiPropertyOptional({ example: 60, minimum: 1, maximum: 3600 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3600)
  estimatedDurationSeconds?: number;
}
