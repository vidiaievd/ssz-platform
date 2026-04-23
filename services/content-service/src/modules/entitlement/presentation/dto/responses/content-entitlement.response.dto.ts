import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EntitlementType } from '../../../domain/value-objects/entitlement-type.vo.js';
import type { ContentEntitlementEntity } from '../../../domain/entities/content-entitlement.entity.js';

export class ContentEntitlementResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440001' })
  userId!: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440002' })
  containerId!: string;

  @ApiProperty({ enum: EntitlementType, example: EntitlementType.MANUAL })
  entitlementType!: EntitlementType;

  @ApiProperty()
  grantedAt!: Date;

  @ApiPropertyOptional({ example: '2027-01-01T00:00:00.000Z' })
  expiresAt!: Date | null;

  @ApiPropertyOptional({ example: '550e8400-e29b-41d4-a716-446655440003' })
  grantedByUserId!: string | null;

  @ApiPropertyOptional({ example: 'invoice-12345' })
  sourceReference!: string | null;

  @ApiPropertyOptional()
  metadata!: Record<string, unknown> | null;

  static fromEntity(entity: ContentEntitlementEntity): ContentEntitlementResponseDto {
    const dto = new ContentEntitlementResponseDto();
    dto.id = entity.id;
    dto.userId = entity.userId;
    dto.containerId = entity.containerId;
    dto.entitlementType = entity.entitlementType;
    dto.grantedAt = entity.grantedAt;
    dto.expiresAt = entity.expiresAt;
    dto.grantedByUserId = entity.grantedByUserId;
    dto.sourceReference = entity.sourceReference;
    dto.metadata = entity.metadata;
    return dto;
  }
}
