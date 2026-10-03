import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
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
import { DifficultyLevel } from '../../../container/domain/value-objects/difficulty-level.vo.js';
import { AtomType, TargetRole } from '../../../exercise/domain/value-objects/atom-type.vo.js';

/** One address to write onto the new exercise — see `ExerciseItemTarget`. */
export class InternalExerciseTargetDto {
  @ApiPropertyOptional({
    description:
      "The template's own name for the piece. Leave it out to address the exercise as " +
      'a whole.',
  })
  @IsString()
  @IsOptional()
  itemKey?: string;

  @ApiProperty({ enum: AtomType })
  @IsEnum(AtomType)
  atomType!: AtomType;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  atomId!: string;

  @ApiProperty({ enum: TargetRole })
  @IsEnum(TargetRole)
  role!: TargetRole;
}

/**
 * Create an exercise on behalf of a person — the narrow shape of authoring, for the
 * promotion gesture (plan 63 phase 9).
 *
 * No visibility and no school: the exercise is private and owned by `ownerUserId`, and
 * this service is in no position to decide otherwise on a service token's word.
 */
export class InternalCreateExerciseRequestDto {
  @ApiProperty({ description: 'Who will own the exercise. It is created private to them.' })
  @IsUUID()
  ownerUserId!: string;

  @ApiProperty({ description: 'Template code, as the document names it.' })
  @IsString()
  @IsNotEmpty()
  templateCode!: string;

  @ApiProperty({ example: 'no' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  targetLanguage!: string;

  @ApiProperty({ enum: DifficultyLevel })
  @IsEnum(DifficultyLevel)
  difficultyLevel!: DifficultyLevel;

  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  content!: Record<string, unknown>;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsObject()
  @IsOptional()
  expectedAnswers?: Record<string, unknown>;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsObject()
  @IsOptional()
  answerCheckSettings?: Record<string, unknown>;

  @ApiPropertyOptional({
    type: InternalExerciseTargetDto,
    isArray: true,
    description:
      'What each piece of the exercise is about. Written after the exercise exists; if ' +
      'any of them cannot be written the whole creation is rolled back.',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InternalExerciseTargetDto)
  @IsOptional()
  targets?: InternalExerciseTargetDto[];
}
