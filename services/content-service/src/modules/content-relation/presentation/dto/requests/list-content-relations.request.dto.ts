import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { RelatableEntityType } from '../../../domain/types/relatable-entity-type.js';
import { RelationKind } from '../../../domain/types/relation-kind.js';

export class ListContentRelationsRequestDto {
  @ApiPropertyOptional({ enum: RelatableEntityType })
  @IsOptional()
  @IsEnum(RelatableEntityType)
  sourceType?: RelatableEntityType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  sourceId?: string;

  @ApiPropertyOptional({ enum: RelatableEntityType })
  @IsOptional()
  @IsEnum(RelatableEntityType)
  targetType?: RelatableEntityType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  targetId?: string;

  @ApiPropertyOptional({ enum: RelationKind })
  @IsOptional()
  @IsEnum(RelationKind)
  relationKind?: RelationKind;
}
