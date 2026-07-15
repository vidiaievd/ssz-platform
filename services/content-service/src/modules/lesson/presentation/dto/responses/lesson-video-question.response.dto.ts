import { ApiProperty } from '@nestjs/swagger';
import { LessonVideoQuestionEntity } from '../../../domain/entities/lesson-video-question.entity.js';

export class LessonVideoQuestionResponseDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-...' })
  id: string;

  @ApiProperty({ example: 'uuid-of-variant' })
  lessonContentVariantId: string;

  @ApiProperty({ example: 'uuid-of-exercise' })
  exerciseId: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  static from(entity: LessonVideoQuestionEntity): LessonVideoQuestionResponseDto {
    const dto = new LessonVideoQuestionResponseDto();
    dto.id = entity.id;
    dto.lessonContentVariantId = entity.lessonContentVariantId;
    dto.exerciseId = entity.exerciseId;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    return dto;
  }
}
