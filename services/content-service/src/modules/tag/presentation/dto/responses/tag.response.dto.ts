import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TagCategory } from '../../../domain/value-objects/tag-category.vo.js';
import { TagScope } from '../../../domain/value-objects/tag-scope.vo.js';
import type { TagEntity } from '../../../domain/entities/tag.entity.js';

export class TagResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ example: 'past-tense' })
  slug!: string;

  @ApiProperty({ example: 'Past tense' })
  name!: string;

  @ApiProperty({ enum: TagCategory, example: TagCategory.TOPIC })
  category!: TagCategory;

  @ApiProperty({ enum: TagScope, example: TagScope.GLOBAL })
  scope!: TagScope;

  @ApiPropertyOptional({ example: '550e8400-e29b-41d4-a716-446655440001' })
  ownerSchoolId!: string | null;

  @ApiProperty()
  createdAt!: Date;

  static fromEntity(entity: TagEntity): TagResponseDto {
    const dto = new TagResponseDto();
    dto.id = entity.id;
    dto.slug = entity.slug;
    dto.name = entity.name;
    dto.category = entity.category;
    dto.scope = entity.scope;
    dto.ownerSchoolId = entity.ownerSchoolId;
    dto.createdAt = entity.createdAt;
    return dto;
  }
}
