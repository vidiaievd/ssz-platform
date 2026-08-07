import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ExerciseInstructionEntity } from '../../../domain/entities/exercise-instruction.entity.js';

export class ExerciseInstructionResponseDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-...' })
  id!: string;

  @ApiProperty({ example: 'uuid-of-exercise' })
  exerciseId!: string;

  @ApiProperty({ example: 'en' })
  instructionLanguage!: string;

  @ApiProperty({ example: 'Choose the correct translation.' })
  instructionText!: string;

  @ApiPropertyOptional({ example: 'Look at context.', nullable: true })
  hintText!: string | null;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true, nullable: true })
  textOverrides!: Record<string, unknown> | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  /**
   * `scope` picks which version of the text to serve: `live` is what a student
   * reads, `draft` is what the author last wrote and has not released. They are
   * the same row until somebody edits a published exercise.
   */
  static from(
    entity: ExerciseInstructionEntity,
    scope: 'live' | 'draft' = 'live',
  ): ExerciseInstructionResponseDto {
    const draft = scope === 'draft';
    const dto = new ExerciseInstructionResponseDto();
    dto.id = entity.id;
    dto.exerciseId = entity.exerciseId;
    dto.instructionLanguage = entity.instructionLanguage;
    dto.instructionText = draft ? entity.authoringInstructionText : entity.instructionText;
    dto.hintText = draft ? entity.authoringHintText : entity.hintText;
    dto.textOverrides = draft ? entity.authoringTextOverrides : entity.textOverrides;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    return dto;
  }
}
