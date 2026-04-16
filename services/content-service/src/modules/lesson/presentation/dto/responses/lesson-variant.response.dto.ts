import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LessonContentVariantEntity } from '../../../domain/entities/lesson-content-variant.entity.js';

export class LessonVariantResponseDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-...' })
  id: string;

  @ApiProperty({ example: 'uuid-of-lesson' })
  lessonId: string;

  @ApiProperty({ example: 'en' })
  explanationLanguage: string;

  @ApiProperty({ example: 'A1', enum: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] })
  minLevel: string;

  @ApiProperty({ example: 'A2', enum: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] })
  maxLevel: string;

  @ApiProperty({ example: 'Greetings — English explanation' })
  displayTitle: string;

  @ApiPropertyOptional({ example: 'Beginner-friendly English explanation of Norwegian greetings.' })
  displayDescription: string | null;

  @ApiProperty({ example: '## Hei!\n\nIn Norwegian, **hei** means hello...' })
  bodyMarkdown: string;

  @ApiPropertyOptional({ example: 5 })
  estimatedReadingMinutes: number | null;

  @ApiProperty({ example: 'draft', enum: ['draft', 'published'] })
  status: string;

  @ApiProperty({ example: 'uuid-of-creator' })
  createdByUserId: string;

  @ApiProperty({ example: 'uuid-of-last-editor' })
  lastEditedByUserId: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiPropertyOptional()
  publishedAt: Date | null;

  @ApiPropertyOptional()
  deletedAt: Date | null;

  static from(entity: LessonContentVariantEntity): LessonVariantResponseDto {
    const dto = new LessonVariantResponseDto();
    dto.id = entity.id;
    dto.lessonId = entity.lessonId;
    dto.explanationLanguage = entity.explanationLanguage;
    dto.minLevel = entity.minLevel;
    dto.maxLevel = entity.maxLevel;
    dto.displayTitle = entity.displayTitle;
    dto.displayDescription = entity.displayDescription;
    dto.bodyMarkdown = entity.bodyMarkdown;
    dto.estimatedReadingMinutes = entity.estimatedReadingMinutes;
    dto.status = entity.status;
    dto.createdByUserId = entity.createdByUserId;
    dto.lastEditedByUserId = entity.lastEditedByUserId;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    dto.publishedAt = entity.publishedAt;
    dto.deletedAt = entity.deletedAt;
    return dto;
  }
}
