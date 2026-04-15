import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ContainerEntity } from '../../../domain/entities/container.entity.js';
import { ContainerLocalizationEntity } from '../../../domain/entities/container-localization.entity.js';
import { ContainerLocalizationResponseDto } from './container-localization.response.dto.js';

export class ContainerResponseDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-...' })
  id: string;

  @ApiPropertyOptional({ example: 'norwegian-for-beginners' })
  slug: string | null;

  @ApiProperty({ example: 'course', enum: ['course', 'module', 'collection'] })
  containerType: string;

  @ApiProperty({ example: 'no' })
  targetLanguage: string;

  @ApiProperty({ example: 'A1', enum: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] })
  difficultyLevel: string;

  @ApiProperty({ example: 'Norwegian for Beginners' })
  title: string;

  @ApiPropertyOptional({ example: 'A comprehensive course for absolute beginners.' })
  description: string | null;

  @ApiPropertyOptional({ example: 'uuid-of-cover-image' })
  coverImageMediaId: string | null;

  @ApiProperty({ example: 'uuid-of-owner-user' })
  ownerUserId: string;

  @ApiPropertyOptional({ example: 'uuid-of-owner-school' })
  ownerSchoolId: string | null;

  @ApiProperty({ example: 'public', enum: ['public', 'school_private', 'shared', 'private'] })
  visibility: string;

  @ApiProperty({
    example: 'public_free',
    enum: [
      'assigned_only',
      'entitlement_required',
      'free_within_school',
      'public_free',
      'public_paid',
    ],
  })
  accessTier: string;

  @ApiPropertyOptional({ example: 'uuid-of-current-published-version' })
  currentPublishedVersionId: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiPropertyOptional()
  deletedAt: Date | null;

  @ApiProperty({ type: () => ContainerLocalizationResponseDto, isArray: true })
  localizations: ContainerLocalizationResponseDto[];

  static from(
    entity: ContainerEntity,
    localizations: ContainerLocalizationEntity[] = [],
  ): ContainerResponseDto {
    const dto = new ContainerResponseDto();
    dto.id = entity.id;
    dto.slug = entity.slug;
    dto.containerType = entity.containerType;
    dto.targetLanguage = entity.targetLanguage;
    dto.difficultyLevel = entity.difficultyLevel;
    dto.title = entity.title;
    dto.description = entity.description;
    dto.coverImageMediaId = entity.coverImageMediaId;
    dto.ownerUserId = entity.ownerUserId;
    dto.ownerSchoolId = entity.ownerSchoolId;
    dto.visibility = entity.visibility;
    dto.accessTier = entity.accessTier;
    dto.currentPublishedVersionId = entity.currentPublishedVersionId;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    dto.deletedAt = entity.deletedAt;
    dto.localizations = localizations.map((l) => ContainerLocalizationResponseDto.from(l));
    return dto;
  }
}
