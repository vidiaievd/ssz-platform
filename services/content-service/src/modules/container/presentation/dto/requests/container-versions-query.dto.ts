import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { VersionStatus } from '../../../domain/value-objects/version-status.vo.js';

export class ContainerVersionsQueryDto {
  @ApiPropertyOptional({ example: 'published', enum: VersionStatus })
  @IsOptional()
  @IsEnum(VersionStatus)
  status?: VersionStatus;

  @ApiPropertyOptional({ example: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 20, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @ApiPropertyOptional({ example: 'version_number_desc', description: 'Sort field and direction' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  sort?: string;
}
