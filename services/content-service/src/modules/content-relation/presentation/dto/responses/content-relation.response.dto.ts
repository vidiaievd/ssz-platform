import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RelatableEntityType } from '../../../domain/types/relatable-entity-type.js';
import { RelationKind } from '../../../domain/types/relation-kind.js';
import type { ContentRelationEntity } from '../../../domain/entities/content-relation.entity.js';

export class ContentRelationResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ enum: RelatableEntityType })
  sourceType!: RelatableEntityType;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440001' })
  sourceId!: string;

  @ApiProperty({ enum: RelationKind })
  relationKind!: RelationKind;

  @ApiProperty({ enum: RelatableEntityType })
  targetType!: RelatableEntityType;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440002' })
  targetId!: string;

  @ApiPropertyOptional({ example: '550e8400-e29b-41d4-a716-446655440003' })
  ownerSchoolId!: string | null;

  @ApiProperty()
  createdAt!: Date;

  static fromEntity(entity: ContentRelationEntity): ContentRelationResponseDto {
    const dto = new ContentRelationResponseDto();
    dto.id = entity.id;
    dto.sourceType = entity.sourceType;
    dto.sourceId = entity.sourceId;
    dto.relationKind = entity.relationKind;
    dto.targetType = entity.targetType;
    dto.targetId = entity.targetId;
    dto.ownerSchoolId = entity.ownerSchoolId;
    dto.createdAt = entity.createdAt;
    return dto;
  }
}
