import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ContainerVersionEntity } from '../../../domain/entities/container-version.entity.js';

export class ContainerVersionResponseDto {
  @ApiProperty({ example: 'a1b2c3d4-...' })
  id: string;

  @ApiProperty({ example: 'uuid-of-container' })
  containerId: string;

  @ApiProperty({ example: 1 })
  versionNumber: number;

  @ApiProperty({ example: 'draft', enum: ['draft', 'published', 'deprecated', 'archived'] })
  status: string;

  @ApiPropertyOptional({ example: 'Added 5 new exercises.' })
  changelog: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty({ example: 'uuid-of-creator' })
  createdByUserId: string;

  @ApiPropertyOptional()
  publishedAt: Date | null;

  @ApiPropertyOptional()
  publishedByUserId: string | null;

  @ApiPropertyOptional()
  deprecatedAt: Date | null;

  @ApiPropertyOptional()
  sunsetAt: Date | null;

  @ApiPropertyOptional()
  archivedAt: Date | null;

  @ApiProperty({ example: 0 })
  revisionCount: number;

  static from(entity: ContainerVersionEntity): ContainerVersionResponseDto {
    const dto = new ContainerVersionResponseDto();
    dto.id = entity.id;
    dto.containerId = entity.containerId;
    dto.versionNumber = entity.versionNumber;
    dto.status = entity.status;
    dto.changelog = entity.changelog;
    dto.createdAt = entity.createdAt;
    dto.createdByUserId = entity.createdByUserId;
    dto.publishedAt = entity.publishedAt;
    dto.publishedByUserId = entity.publishedByUserId;
    dto.deprecatedAt = entity.deprecatedAt;
    dto.sunsetAt = entity.sunsetAt;
    dto.archivedAt = entity.archivedAt;
    dto.revisionCount = entity.revisionCount;
    return dto;
  }
}
