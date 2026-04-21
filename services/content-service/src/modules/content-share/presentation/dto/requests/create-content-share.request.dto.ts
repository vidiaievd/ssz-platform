import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TaggableEntityType } from '../../../../../shared/access-control/domain/types/taggable-entity-type.js';
import { SharePermission } from '../../../domain/value-objects/share-permission.vo.js';

export class CreateContentShareRequestDto {
  @ApiProperty({ enum: TaggableEntityType, example: TaggableEntityType.CONTAINER })
  @IsEnum(TaggableEntityType)
  entityType!: TaggableEntityType;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsUUID()
  entityId!: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440001' })
  @IsUUID()
  sharedWithUserId!: string;

  @ApiPropertyOptional({ enum: SharePermission, default: SharePermission.READ })
  @IsOptional()
  @IsEnum(SharePermission)
  permission?: SharePermission;

  @ApiPropertyOptional({ example: '2027-01-01T00:00:00.000Z' })
  @IsOptional()
  @IsISO8601()
  @Type(() => Date)
  expiresAt?: Date;

  @ApiPropertyOptional({ example: 'Shared for review purposes', maxLength: 500 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  note?: string;
}
