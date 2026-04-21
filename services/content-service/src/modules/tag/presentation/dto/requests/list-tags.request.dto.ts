import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { TagCategory } from '../../../domain/value-objects/tag-category.vo.js';
import { TagScope } from '../../../domain/value-objects/tag-scope.vo.js';

export class ListTagsRequestDto {
  @ApiPropertyOptional({ enum: TagScope })
  @IsOptional()
  @IsEnum(TagScope)
  scope?: TagScope;

  @ApiPropertyOptional({ enum: TagCategory })
  @IsOptional()
  @IsEnum(TagCategory)
  category?: TagCategory;

  @ApiPropertyOptional({ description: 'Required when scope=school' })
  @IsOptional()
  @IsUUID()
  schoolId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}
