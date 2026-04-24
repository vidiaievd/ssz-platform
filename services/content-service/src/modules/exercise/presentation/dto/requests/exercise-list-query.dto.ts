import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Min } from 'class-validator';
import { CatalogFilterQueryDto } from '../../../../../shared/discovery/presentation/dto/catalog-filter-query.dto.js';

export class ExerciseListQueryDto extends CatalogFilterQueryDto {
  @ApiPropertyOptional({ example: 'uuid-of-template' })
  @IsOptional()
  @IsUUID()
  exerciseTemplateId?: string;

  @ApiPropertyOptional({ example: 30, description: 'Minimum estimated duration in seconds' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  estimatedDurationMin?: number;

  @ApiPropertyOptional({ example: 300, description: 'Maximum estimated duration in seconds' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  estimatedDurationMax?: number;
}
