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

  @ApiPropertyOptional({ example: 'uuid-of-section' })
  sectionId: string | null;

  @ApiPropertyOptional({
    example: 'Introduction',
    description: 'Deprecated free-text fallback — prefer sectionId',
  })
  sectionLabel: string | null;

  @ApiPropertyOptional({ example: 10, description: 'XP awarded to the student on completion.' })
  xpReward: number | null;

  @ApiPropertyOptional({
    example: 'Greetings and Introductions',
    description: 'Display title of the referenced content, resolved server-side.',
  })
  title: string | null;

  @ApiPropertyOptional({
    example: ['Tell a doctor where it hurts'],
    type: [String],
    description:
      'Nested containers only (a course’s units): the unit’s learning goals, empty when unset. Absent on other items.',
  })
  learningGoals?: string[];

  @ApiProperty()
  addedAt: Date;

  static from(
    entity: ContainerItemEntity,
    title: string | null = null,
    learningGoals?: string[],
  ): ContainerItemResponseDto {
    const dto = new ContainerItemResponseDto();
    dto.id = entity.id;
    dto.containerVersionId = entity.containerVersionId;
    dto.position = entity.position;
    dto.itemType = entity.itemType;
    dto.itemId = entity.itemId;
    dto.isRequired = entity.isRequired;
    dto.sectionId = entity.sectionId;
    dto.sectionLabel = entity.sectionLabel;
    dto.xpReward = entity.xpReward;
    dto.title = title;
    if (learningGoals !== undefined) dto.learningGoals = learningGoals;
    dto.addedAt = entity.addedAt;
    return dto;
  }
}

export class DuplicatedContainerItemResponseDto {
  @ApiProperty({ example: 'a1b2c3d4-...', description: 'The new row (container item).' })
  itemId: string;

  @ApiProperty({ example: 4, description: 'Its position — right after the original row.' })
  position: number;

  @ApiProperty({
    example: 'uuid-of-the-copy',
    description: 'The copied material the new row places.',
  })
  materialId: string;
}

export class MovedContainerItemResponseDto {
  @ApiProperty({
    example: 'a1b2c3d4-...',
    description: 'The new row in the target draft — a row of another version is another row.',
  })
  itemId: string;

  @ApiProperty({ example: 12, description: 'Its position — last in the target draft.' })
  position: number;
}
