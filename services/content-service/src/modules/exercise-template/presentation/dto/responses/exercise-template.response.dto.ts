import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ExerciseTemplateEntity } from '../../../domain/entities/exercise-template.entity.js';

export class ExerciseTemplateResponseDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-...' })
  id!: string;

  @ApiProperty({ example: 'multiple_choice' })
  code!: string;

  @ApiProperty({ example: 'Multiple Choice' })
  name!: string;

  @ApiPropertyOptional({ example: 'Single correct answer from a list of options.' })
  description!: string | null;

  @ApiProperty({ type: 'object', additionalProperties: true })
  contentSchema!: Record<string, unknown>;

  @ApiProperty({ type: 'object', additionalProperties: true })
  answerSchema!: Record<string, unknown>;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true, nullable: true })
  defaultCheckSettings!: Record<string, unknown> | null;

  @ApiPropertyOptional({ type: [String], nullable: true, example: ['no', 'de'] })
  supportedLanguages!: string[] | null;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty()
  createdAt!: Date;

  static from(entity: ExerciseTemplateEntity): ExerciseTemplateResponseDto {
    const dto = new ExerciseTemplateResponseDto();
    dto.id = entity.id;
    dto.code = entity.code;
    dto.name = entity.name;
    dto.description = entity.description;
    dto.contentSchema = entity.contentSchema;
    dto.answerSchema = entity.answerSchema;
    dto.defaultCheckSettings = entity.defaultCheckSettings;
    dto.supportedLanguages = entity.supportedLanguages;
    dto.isActive = entity.isActive;
    dto.createdAt = entity.createdAt;
    return dto;
  }
}
