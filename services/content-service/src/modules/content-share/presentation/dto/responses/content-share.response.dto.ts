import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TaggableEntityType } from '../../../../../shared/access-control/domain/types/taggable-entity-type.js';
import { SharePermission } from '../../../domain/value-objects/share-permission.vo.js';
import type { ContentShareEntity } from '../../../domain/entities/content-share.entity.js';

export class ContentShareResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ enum: TaggableEntityType, example: TaggableEntityType.CONTAINER })
  entityType!: TaggableEntityType;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440001' })
  entityId!: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440002' })
  sharedWithUserId!: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440003' })
  sharedByUserId!: string;

  @ApiProperty({ enum: SharePermission, example: SharePermission.READ })
  permission!: SharePermission;

  @ApiPropertyOptional({ example: '2027-01-01T00:00:00.000Z' })
  expiresAt!: Date | null;

  @ApiPropertyOptional({ example: 'Shared for review purposes' })
  note!: string | null;

  @ApiProperty()
  createdAt!: Date;

  static fromEntity(entity: ContentShareEntity): ContentShareResponseDto {
    const dto = new ContentShareResponseDto();
    dto.id = entity.id;
    dto.entityType = entity.entityType;
    dto.entityId = entity.entityId;
    dto.sharedWithUserId = entity.sharedWithUserId;
    dto.sharedByUserId = entity.sharedByUserId;
    dto.permission = entity.permission;
    dto.expiresAt = entity.expiresAt;
    dto.note = entity.note;
    dto.createdAt = entity.createdAt;
    return dto;
  }
}
