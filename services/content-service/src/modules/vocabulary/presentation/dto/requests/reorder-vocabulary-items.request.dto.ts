import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, IsUUID, Min, ValidateNested } from 'class-validator';

export class ReorderItemEntryRequestDto {
  @ApiProperty({ example: 'uuid-of-item' })
  @IsUUID()
  id: string;

  @ApiProperty({ example: 0, description: '0-based target position', minimum: 0 })
  @IsInt()
  @Min(0)
  position: number;
}

export class ReorderVocabularyItemsRequestDto {
  @ApiProperty({
    type: [ReorderItemEntryRequestDto],
    description: 'Complete ordered list of all items in the vocabulary list.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReorderItemEntryRequestDto)
  items: ReorderItemEntryRequestDto[];
}
