import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VocabularyListEntity } from '../../../domain/entities/vocabulary-list.entity.js';

export class VocabularyListResponseDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-...' })
  id!: string;

  @ApiPropertyOptional({ example: 'daily-norwegian' })
  slug!: string | null;

  @ApiProperty({ example: 'Daily Norwegian' })
  title!: string;

  @ApiPropertyOptional({ example: 'Common vocabulary for everyday conversations.' })
  description!: string | null;

  @ApiProperty({ example: 'no' })
  targetLanguage!: string;

  @ApiProperty({ example: 'A1', enum: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] })
  difficultyLevel!: string;

  @ApiProperty({ example: 'uuid-of-owner-user' })
  ownerUserId!: string;

  @ApiPropertyOptional({ example: 'uuid-of-owner-school' })
  ownerSchoolId!: string | null;

  @ApiProperty({ example: 'public', enum: ['public', 'school_private', 'shared', 'private'] })
  visibility!: string;

  @ApiProperty({ example: true })
  autoAddToSrs!: boolean;

  @ApiPropertyOptional({ example: 'uuid-of-cover-image' })
  coverImageMediaId!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  @ApiPropertyOptional()
  deletedAt!: Date | null;

  static from(entity: VocabularyListEntity): VocabularyListResponseDto {
    const dto = new VocabularyListResponseDto();
    dto.id = entity.id;
    dto.slug = entity.slug;
    dto.title = entity.title;
    dto.description = entity.description;
    dto.targetLanguage = entity.targetLanguage;
    dto.difficultyLevel = entity.difficultyLevel;
    dto.ownerUserId = entity.ownerUserId;
    dto.ownerSchoolId = entity.ownerSchoolId;
    dto.visibility = entity.visibility;
    dto.autoAddToSrs = entity.autoAddToSrs;
    dto.coverImageMediaId = entity.coverImageMediaId;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    dto.deletedAt = entity.deletedAt;
    return dto;
  }
}
