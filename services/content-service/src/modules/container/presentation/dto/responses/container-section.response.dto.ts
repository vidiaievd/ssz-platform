import { ApiProperty } from '@nestjs/swagger';
import { ContainerSectionEntity } from '../../../domain/entities/container-section.entity.js';

export class ContainerSectionResponseDto {
  @ApiProperty({ example: 'a1b2c3d4-...' })
  id: string;

  @ApiProperty({ example: 'uuid-of-version' })
  containerVersionId: string;

  @ApiProperty({ example: 'A1 — Beginner' })
  title: string;

  @ApiProperty({ example: 0 })
  position: number;

  @ApiProperty()
  createdAt: Date;

  static from(entity: ContainerSectionEntity): ContainerSectionResponseDto {
    const dto = new ContainerSectionResponseDto();
    dto.id = entity.id;
    dto.containerVersionId = entity.containerVersionId;
    dto.title = entity.title;
    dto.position = entity.position;
    dto.createdAt = entity.createdAt;
    return dto;
  }
}
