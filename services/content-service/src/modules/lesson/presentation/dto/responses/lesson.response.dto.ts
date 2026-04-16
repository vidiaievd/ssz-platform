import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LessonEntity } from '../../../domain/entities/lesson.entity.js';

export class LessonResponseDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-...' })
  id: string;

  @ApiPropertyOptional({ example: 'greetings-and-introductions' })
  slug: string | null;

  @ApiProperty({ example: 'no' })
  targetLanguage: string;

  @ApiProperty({ example: 'A1', enum: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] })
  difficultyLevel: string;

  @ApiProperty({ example: 'Greetings and Introductions' })
  title: string;

  @ApiPropertyOptional({ example: 'Learn how to greet people in Norwegian.' })
  description: string | null;

  @ApiPropertyOptional({ example: 'uuid-of-cover-image' })
  coverImageMediaId: string | null;

  @ApiProperty({ example: 'uuid-of-owner-user' })
  ownerUserId: string;

  @ApiPropertyOptional({ example: 'uuid-of-owner-school' })
  ownerSchoolId: string | null;

  @ApiProperty({ example: 'public', enum: ['public', 'school_private', 'shared', 'private'] })
  visibility: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiPropertyOptional()
  deletedAt: Date | null;

  static from(entity: LessonEntity): LessonResponseDto {
    const dto = new LessonResponseDto();
    dto.id = entity.id;
    dto.slug = entity.slug;
    dto.targetLanguage = entity.targetLanguage;
    dto.difficultyLevel = entity.difficultyLevel;
    dto.title = entity.title;
    dto.description = entity.description;
    dto.coverImageMediaId = entity.coverImageMediaId;
    dto.ownerUserId = entity.ownerUserId;
    dto.ownerSchoolId = entity.ownerSchoolId;
    dto.visibility = entity.visibility;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    dto.deletedAt = entity.deletedAt;
    return dto;
  }
}
