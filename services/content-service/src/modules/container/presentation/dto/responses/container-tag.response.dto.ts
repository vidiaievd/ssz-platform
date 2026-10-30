import { ApiProperty } from '@nestjs/swagger';
import type { ContainerTag } from '../../../application/ports/container-tag-reader.port.js';

export class ContainerTagResponseDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-...' })
  id!: string;

  @ApiProperty({ example: 'Speaking' })
  name!: string;

  @ApiProperty({ example: 'skill', enum: ['topic', 'situation', 'skill', 'level', 'other'] })
  category!: string;

  static from(tag: ContainerTag): ContainerTagResponseDto {
    const dto = new ContainerTagResponseDto();
    dto.id = tag.id;
    dto.name = tag.name;
    dto.category = tag.category;
    return dto;
  }
}
