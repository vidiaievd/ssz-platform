import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ExerciseEntity } from '../../../domain/entities/exercise.entity.js';
import { ExerciseInstructionResponseDto } from './exercise-instruction.response.dto.js';

export class ExerciseResponseDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-...' })
  id!: string;

  @ApiProperty({ example: 'uuid-of-template' })
  exerciseTemplateId!: string;

  @ApiProperty({ example: 'multiple_choice' })
  templateCode!: string;

  @ApiProperty({ example: 'no' })
  targetLanguage!: string;

  @ApiProperty({ example: 'A1', enum: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] })
  difficultyLevel!: string;

  @ApiProperty({ type: 'object', additionalProperties: true })
  content!: Record<string, unknown>;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true, nullable: true })
  answerCheckSettings!: Record<string, unknown> | null;

  @ApiProperty({ example: 'uuid-of-owner-user' })
  ownerUserId!: string;

  @ApiPropertyOptional({ example: 'uuid-of-owner-school', nullable: true })
  ownerSchoolId!: string | null;

  @ApiProperty({ example: 'public', enum: ['public', 'school_private', 'shared', 'private'] })
  visibility!: string;

  @ApiPropertyOptional({ example: 60, nullable: true })
  estimatedDurationSeconds!: number | null;

  @ApiPropertyOptional({ type: [ExerciseInstructionResponseDto], nullable: true })
  instructions!: ExerciseInstructionResponseDto[] | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  @ApiPropertyOptional()
  deletedAt!: Date | null;

  static from(entity: ExerciseEntity): ExerciseResponseDto {
    const dto = new ExerciseResponseDto();
    dto.id = entity.id;
    dto.exerciseTemplateId = entity.exerciseTemplateId;
    dto.templateCode = entity.templateCode;
    dto.targetLanguage = entity.targetLanguage;
    dto.difficultyLevel = entity.difficultyLevel;
    dto.content = entity.content;
    dto.answerCheckSettings = entity.answerCheckSettings;
    dto.ownerUserId = entity.ownerUserId;
    dto.ownerSchoolId = entity.ownerSchoolId;
    dto.visibility = entity.visibility;
    dto.estimatedDurationSeconds = entity.estimatedDurationSeconds;
    dto.instructions = entity.instructions
      ? entity.instructions.map((i) => ExerciseInstructionResponseDto.from(i))
      : null;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    dto.deletedAt = entity.deletedAt;
    return dto;
  }
}

/** Same as ExerciseResponseDto but includes expectedAnswers. Used by owner/engine endpoints. */
export class ExerciseWithAnswersResponseDto extends ExerciseResponseDto {
  @ApiProperty({ type: 'object', additionalProperties: true })
  expectedAnswers!: Record<string, unknown>;

  static fromWithAnswers(entity: ExerciseEntity): ExerciseWithAnswersResponseDto {
    const dto = ExerciseResponseDto.from(entity) as ExerciseWithAnswersResponseDto;
    dto.expectedAnswers = entity.expectedAnswers;
    return dto;
  }
}
