import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { TagCategory } from '../../../domain/value-objects/tag-category.vo.js';
import { TagScope } from '../../../domain/value-objects/tag-scope.vo.js';

export class CreateTagRequestDto {
  @ApiProperty({ example: 'Past tense', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiProperty({ enum: TagCategory, example: TagCategory.TOPIC })
  @IsEnum(TagCategory)
  category!: TagCategory;

  @ApiProperty({ enum: TagScope, example: TagScope.GLOBAL })
  @IsEnum(TagScope)
  scope!: TagScope;

  @ApiPropertyOptional({
    description: 'Required when scope=school',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  @IsOptional()
  @IsUUID()
  ownerSchoolId?: string;
}
