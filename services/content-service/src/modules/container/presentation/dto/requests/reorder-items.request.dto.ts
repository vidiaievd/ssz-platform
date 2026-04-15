import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

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
}
