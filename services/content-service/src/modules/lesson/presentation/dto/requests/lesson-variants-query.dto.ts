import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { VariantStatus } from '../../../domain/value-objects/variant-status.vo.js';

export class LessonVariantsQueryDto {
  @ApiPropertyOptional({ example: 'published', enum: VariantStatus })
  @IsOptional()
  @IsEnum(VariantStatus)
  status?: VariantStatus;

  @ApiPropertyOptional({ example: 'en', description: 'BCP-47 language tag' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  explanationLanguage?: string;

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

  @ApiPropertyOptional({ example: 'created_at_asc', description: 'Sort field and direction' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  sort?: string;
}
