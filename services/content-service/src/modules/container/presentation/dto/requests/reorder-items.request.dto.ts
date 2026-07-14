import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsOptional, IsUUID, ValidateNested } from 'class-validator';

export class SectionMoveRequestDto {
  @ApiProperty({ example: 'uuid-of-item' })
  @IsUUID()
  itemId: string;

  // null ungroups the item; omit/absent entries keep their current section.
  @ApiPropertyOptional({ example: 'uuid-of-target-section', nullable: true })
  @IsOptional()
  @IsUUID()
  sectionId: string | null;
}

export class ReorderItemsRequestDto {
  @ApiProperty({
    description: 'Ordered list of item IDs representing the new positions',
    example: ['uuid-1', 'uuid-2', 'uuid-3'],
    isArray: true,
    type: String,
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('all', { each: true })
  orderedItemIds: string[];

  @ApiPropertyOptional({
    description:
      'Optional per-item section moves, applied atomically alongside the position renumbering — enables cross-section drag-and-drop in a single call.',
    type: () => SectionMoveRequestDto,
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SectionMoveRequestDto)
  sectionMoves?: SectionMoveRequestDto[];
}
