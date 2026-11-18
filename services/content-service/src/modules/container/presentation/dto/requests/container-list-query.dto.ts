import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
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

  /**
   * Obsolete courses are left out of the list (plan 90, Q5) — except the caller's own.
   * A reader that resolves courses the learner already studies (dashboards) asks for
   * them back with `true`; the catalogue never does.
   */
  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  includeObsolete?: boolean;
}
