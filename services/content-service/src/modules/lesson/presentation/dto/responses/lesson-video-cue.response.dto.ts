import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LessonVideoCueEntity } from '../../../domain/entities/lesson-video-cue.entity.js';

export class LessonVideoCueResponseDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-...' })
  id: string;

  @ApiProperty({ example: 'uuid-of-variant' })
  lessonContentVariantId: string;

  @ApiProperty({ example: 0 })
  position: number;

  @ApiProperty({ example: 12.5 })
  startSeconds: number;

  @ApiProperty({ example: 'Hei, hvordan har du det?' })
  targetLine: string;

  @ApiPropertyOptional({ example: 'Hi, how are you?' })
  translationLine: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  static from(entity: LessonVideoCueEntity): LessonVideoCueResponseDto {
    const dto = new LessonVideoCueResponseDto();
    dto.id = entity.id;
    dto.lessonContentVariantId = entity.lessonContentVariantId;
    dto.position = entity.position;
    dto.startSeconds = entity.startSeconds;
    dto.targetLine = entity.targetLine;
    dto.translationLine = entity.translationLine;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    return dto;
  }
}
