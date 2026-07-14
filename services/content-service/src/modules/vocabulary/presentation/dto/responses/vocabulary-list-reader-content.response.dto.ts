import { ApiProperty } from '@nestjs/swagger';
import type { VocabularyListReaderContent } from '../../../application/queries/get-vocabulary-list-reader-content/get-vocabulary-list-reader-content.handler.js';
import { VocabularyItemDisplayResponseDto } from './vocabulary-item-display.response.dto.js';

export class VocabularyListReaderContentResponseDto {
  @ApiProperty({ example: 'uuid-of-vocabulary-list' })
  id!: string;

  @ApiProperty({ example: 'Bolig-ord' })
  title!: string;

  @ApiProperty({ type: [VocabularyItemDisplayResponseDto] })
  items!: VocabularyItemDisplayResponseDto[];

  static from(content: VocabularyListReaderContent): VocabularyListReaderContentResponseDto {
    const dto = new VocabularyListReaderContentResponseDto();
    dto.id = content.id;
    dto.title = content.title;
    dto.items = content.items.map((i) => VocabularyItemDisplayResponseDto.from(i));
    return dto;
  }
}
