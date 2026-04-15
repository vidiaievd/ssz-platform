import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ContainerItemEntity } from '../../../domain/entities/container-item.entity.js';

export class ContainerItemResponseDto {
  @ApiProperty({ example: 'a1b2c3d4-...' })
  id: string;

  @ApiProperty({ example: 'uuid-of-version' })
  containerVersionId: string;

  @ApiProperty({ example: 0 })
  position: number;

  @ApiProperty({
    example: 'lesson',
    enum: ['container', 'lesson', 'vocabulary_list', 'grammar_rule', 'exercise'],
  })
  itemType: string;

  @ApiProperty({ example: 'uuid-of-referenced-item' })
  itemId: string;

  @ApiProperty({ example: true })
  isRequired: boolean;

  @ApiPropertyOptional({ example: 'Introduction' })
  sectionLabel: string | null;

  @ApiProperty()
  addedAt: Date;

  static from(entity: ContainerItemEntity): ContainerItemResponseDto {
    const dto = new ContainerItemResponseDto();
    dto.id = entity.id;
    dto.containerVersionId = entity.containerVersionId;
    dto.position = entity.position;
    dto.itemType = entity.itemType;
    dto.itemId = entity.itemId;
    dto.isRequired = entity.isRequired;
    dto.sectionLabel = entity.sectionLabel;
    dto.addedAt = entity.addedAt;
    return dto;
  }
}
