import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { TagCategory } from '../../../domain/value-objects/tag-category.vo.js';

export class UpdateTagRequestDto {
  @ApiPropertyOptional({ example: 'Future tense', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ enum: TagCategory })
  @IsOptional()
  @IsEnum(TagCategory)
  category?: TagCategory;
}
