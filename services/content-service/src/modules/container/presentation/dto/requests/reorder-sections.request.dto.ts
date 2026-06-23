import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

export class ReorderSectionsRequestDto {
  @ApiProperty({
    description: 'Ordered list of section IDs representing the new positions',
    example: ['uuid-1', 'uuid-2', 'uuid-3'],
    isArray: true,
    type: String,
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('all', { each: true })
  orderedSectionIds: string[];
}
