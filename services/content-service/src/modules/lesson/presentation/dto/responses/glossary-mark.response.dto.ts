import { ApiProperty } from '@nestjs/swagger';
import { GlossaryMarkRow } from '../../../domain/repositories/lesson-glossary-mark.repository.interface.js';

export class GlossaryMarkResponseDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-...' })
  id: string;

  @ApiProperty({ example: 'uuid-of-vocabulary-item' })
  vocabularyItemId: string;

  @ApiProperty({ example: 1 })
  occurrenceCount: number;

  static from(row: GlossaryMarkRow): GlossaryMarkResponseDto {
    const dto = new GlossaryMarkResponseDto();
    dto.id = row.id;
    dto.vocabularyItemId = row.vocabularyItemId;
    dto.occurrenceCount = row.occurrenceCount;
    return dto;
  }
}
