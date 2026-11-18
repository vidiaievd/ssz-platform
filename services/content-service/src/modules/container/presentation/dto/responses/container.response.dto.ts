import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ContainerEntity } from '../../../domain/entities/container.entity.js';
import { ContainerLocalizationEntity } from '../../../domain/entities/container-localization.entity.js';
import { ContainerLocalizationResponseDto } from './container-localization.response.dto.js';
import { ContainerTagResponseDto } from './container-tag.response.dto.js';
import type { ContainerTag } from '../../../application/ports/container-tag-reader.port.js';

export class ContainerResponseDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-...' })
  id!: string;

  @ApiPropertyOptional({ example: 'norwegian-for-beginners' })
  slug!: string | null;

  @ApiProperty({ example: 'course', enum: ['course', 'module', 'collection'] })
  containerType!: string;

  @ApiProperty({ example: 'no' })
  targetLanguage!: string;

  @ApiProperty({ example: 'A1', enum: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] })
  difficultyLevel!: string;

  @ApiProperty({ example: 'Norwegian for Beginners' })
  title!: string;

  @ApiPropertyOptional({ example: 'A comprehensive course for absolute beginners.' })
  description!: string | null;

  @ApiPropertyOptional({ example: 'uuid-of-cover-image' })
  coverImageMediaId!: string | null;

  @ApiProperty({ example: 'uuid-of-owner-user' })
  ownerUserId!: string;

  @ApiPropertyOptional({ example: 'uuid-of-owner-school' })
  ownerSchoolId!: string | null;

  @ApiProperty({ example: 'public', enum: ['public', 'school_private', 'shared', 'private'] })
  visibility!: string;

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
  accessTier!: string;

  @ApiProperty({ example: 'cefr', enum: ['cefr', 'custom', 'single'] })
  levelSystem!: string;

  @ApiProperty({
    example: 'open',
    enum: ['open', 'sequential'],
    description: 'Course-only: how sub-lessons unlock for students.',
  })
  gatingMode!: string;

  @ApiProperty({
    example: ['Order food in a café'],
    type: [String],
    description:
      'What a student should be able to do after it — on a module its own goals, on a course «What you will learn». Empty when unset.',
  })
  learningGoals!: string[];

  @ApiPropertyOptional({ example: 'uuid-of-current-published-version' })
  currentPublishedVersionId!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  @ApiPropertyOptional()
  deletedAt!: Date | null;

  @ApiPropertyOptional({ description: 'Set when the course has been archived (reversible).' })
  archivedAt!: Date | null;

  @ApiProperty({
    example: 'maintained',
    enum: ['maintained', 'unmaintained', 'obsolete'],
    description:
      'Whether the course is still looked after (plan 90, Q5): `unmaintained` — in the catalogue with a badge; `obsolete` — out of the catalogue, no new enrolments, current learners carry on.',
  })
  maintenanceStatus!: string;

  @ApiPropertyOptional({
    example: 'author',
    enum: ['author', 'school'],
    nullable: true,
    description: 'Who set the status last — the author by hand or the owning school’s lifecycle. Null: never changed.',
  })
  maintenanceSource!: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'When the maintenance status last changed.' })
  maintenanceChangedAt!: Date | null;

  @ApiPropertyOptional({
    example: 'Nordic Language School',
    nullable: true,
    description: 'The owning school’s name kept from when it closed; null while the school is open.',
  })
  ownerSchoolName!: string | null;

  @ApiProperty({ type: () => ContainerLocalizationResponseDto, isArray: true })
  localizations!: ContainerLocalizationResponseDto[];

  @ApiProperty({
    type: () => ContainerTagResponseDto,
    isArray: true,
    description: 'Tags placed on the container, by name. Empty when it has none.',
  })
  tags!: ContainerTagResponseDto[];

  static from(
    entity: ContainerEntity,
    localizations: ContainerLocalizationEntity[] = [],
    tags: ContainerTag[] = [],
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
    dto.levelSystem = entity.levelSystem;
    dto.gatingMode = entity.gatingMode;
    dto.learningGoals = entity.learningGoals;
    dto.currentPublishedVersionId = entity.currentPublishedVersionId;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    dto.deletedAt = entity.deletedAt;
    dto.archivedAt = entity.archivedAt;
    dto.maintenanceStatus = entity.maintenanceStatus;
    dto.maintenanceSource = entity.maintenanceSource;
    dto.maintenanceChangedAt = entity.maintenanceChangedAt;
    dto.ownerSchoolName = entity.ownerSchoolName;
    dto.localizations = localizations.map((l) => ContainerLocalizationResponseDto.from(l));
    dto.tags = tags.map((t) => ContainerTagResponseDto.from(t));
    return dto;
  }
}
