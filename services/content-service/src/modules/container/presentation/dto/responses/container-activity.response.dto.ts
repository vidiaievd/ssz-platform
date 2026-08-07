import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  ContainerActivityEntry,
  ContainerActivityResult,
} from '../../../application/queries/get-container-activity/get-container-activity.handler.js';

export class ContainerActivityEntryResponseDto {
  @ApiProperty({ example: 'uuid-of-entry' })
  id!: string;

  @ApiProperty({
    example: 'EXERCISE',
    enum: ['CONTAINER', 'LESSON', 'EXERCISE', 'VOCABULARY_LIST', 'GRAMMAR_RULE'],
  })
  entityType!: string;

  @ApiProperty({ example: 'uuid-of-exercise' })
  entityId!: string;

  @ApiPropertyOptional({
    example: 'Gap-Fill',
    nullable: true,
    description: 'Current display name of the entity; null once it has been deleted.',
  })
  entityTitle!: string | null;

  @ApiProperty({
    example: 'updated',
    description:
      'What happened: created, updated, deleted, published, unpublished, archived, ' +
      'restored, instructions_updated. Open-ended by design — new actions are added ' +
      'without a migration.',
  })
  action!: string;

  @ApiProperty({
    example: 'uuid-of-user',
    description: 'Who did it. Names are resolved by the caller, which owns the user directory.',
  })
  actorUserId!: string;

  @ApiProperty({ type: [String], example: ['content', 'expectedAnswers'] })
  changedFields!: string[];

  @ApiProperty()
  occurredAt!: Date;

  static from(entry: ContainerActivityEntry): ContainerActivityEntryResponseDto {
    const dto = new ContainerActivityEntryResponseDto();
    dto.id = entry.id;
    dto.entityType = entry.entityType;
    dto.entityId = entry.entityId;
    dto.entityTitle = entry.entityTitle;
    dto.action = entry.action;
    dto.actorUserId = entry.actorUserId;
    dto.changedFields = entry.changedFields;
    dto.occurredAt = entry.occurredAt;
    return dto;
  }
}

export class ContainerActivityResponseDto {
  @ApiProperty({ type: () => ContainerActivityEntryResponseDto, isArray: true })
  entries!: ContainerActivityEntryResponseDto[];

  @ApiProperty({
    example: true,
    description:
      'Whether older entries exist. Page through them with `before` set to the ' +
      '`occurredAt` of the last entry received.',
  })
  hasMore!: boolean;

  static from(result: ContainerActivityResult): ContainerActivityResponseDto {
    const dto = new ContainerActivityResponseDto();
    dto.entries = result.entries.map((e) => ContainerActivityEntryResponseDto.from(e));
    dto.hasMore = result.hasMore;
    return dto;
  }
}
