import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { RelatableEntityType } from '../../../domain/types/relatable-entity-type.js';
import { RelationKind } from '../../../domain/types/relation-kind.js';

export class CreateContentRelationRequestDto {
  @ApiProperty({ enum: RelatableEntityType })
  @IsEnum(RelatableEntityType)
  sourceType!: RelatableEntityType;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsUUID()
  sourceId!: string;

  @ApiProperty({ enum: RelationKind })
  @IsEnum(RelationKind)
  relationKind!: RelationKind;

  @ApiProperty({ enum: RelatableEntityType })
  @IsEnum(RelatableEntityType)
  targetType!: RelatableEntityType;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440001' })
  @IsUUID()
  targetId!: string;

  @ApiPropertyOptional({ example: '550e8400-e29b-41d4-a716-446655440002' })
  @IsOptional()
  @IsUUID()
  ownerSchoolId?: string;
}
