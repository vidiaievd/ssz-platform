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

  static from(entity: ExerciseInstructionEntity): ExerciseInstructionResponseDto {
    const dto = new ExerciseInstructionResponseDto();
    dto.id = entity.id;
    dto.exerciseId = entity.exerciseId;
    dto.instructionLanguage = entity.instructionLanguage;
    dto.instructionText = entity.instructionText;
    dto.hintText = entity.hintText;
    dto.textOverrides = entity.textOverrides;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    return dto;
  }
}
