import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ContainerLocalizationEntity } from '../../../domain/entities/container-localization.entity.js';

export class ContainerLocalizationResponseDto {
  @ApiProperty({ example: 'a1b2c3d4-...' })
  id: string;

  @ApiProperty({ example: 'no' })
  languageCode: string;

  @ApiProperty({ example: 'Norsk for nybegynnere' })
  title: string;

  @ApiPropertyOptional({ example: 'Et kurs for absolutte nybegynnere.' })
  description: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  static from(entity: ContainerLocalizationEntity): ContainerLocalizationResponseDto {
    const dto = new ContainerLocalizationResponseDto();
    dto.id = entity.id;
    dto.languageCode = entity.languageCode;
    dto.title = entity.title;
    dto.description = entity.description;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    return dto;
  }
}
