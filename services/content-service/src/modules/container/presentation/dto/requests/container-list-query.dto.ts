import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { CatalogFilterQueryDto } from '../../../../../shared/discovery/presentation/dto/catalog-filter-query.dto.js';
import { ContainerType } from '../../../domain/value-objects/container-type.vo.js';
import { AccessTier } from '../../../domain/value-objects/access-tier.vo.js';

export class ContainerListQueryDto extends CatalogFilterQueryDto {
  @ApiPropertyOptional({ example: 'course', enum: ContainerType })
  @IsOptional()
  @IsEnum(ContainerType)
  containerType?: ContainerType;

  @ApiPropertyOptional({ example: 'public_free', enum: AccessTier })
  @IsOptional()
  @IsEnum(AccessTier)
  accessTier?: AccessTier;
}
