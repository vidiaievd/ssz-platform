import { ApiProperty } from '@nestjs/swagger';
import { LessonListeningStageEntity } from '../../../domain/entities/lesson-listening-stage.entity.js';
import { ListeningStageType } from '../../../domain/value-objects/listening-stage-type.vo.js';

export class LessonListeningStageResponseDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-...' })
  id: string;

  @ApiProperty({ example: 'uuid-of-variant' })
  lessonContentVariantId: string;

  @ApiProperty({ example: 'uuid-of-exercise' })
  exerciseId: string;

  @ApiProperty({ example: 0 })
  position: number;

  @ApiProperty({ example: 'gap_fill', enum: ListeningStageType })
  stageType: ListeningStageType;

  @ApiProperty()
  createdAt: Date;

  static from(entity: LessonListeningStageEntity): LessonListeningStageResponseDto {
    const dto = new LessonListeningStageResponseDto();
    dto.id = entity.id;
    dto.lessonContentVariantId = entity.lessonContentVariantId;
    dto.exerciseId = entity.exerciseId;
    dto.position = entity.position;
    dto.stageType = entity.stageType;
    dto.createdAt = entity.createdAt;
    return dto;
  }
}
