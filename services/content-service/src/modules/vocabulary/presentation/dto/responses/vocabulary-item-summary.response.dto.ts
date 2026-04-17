import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VocabularyItemEntity } from '../../../domain/entities/vocabulary-item.entity.js';

/**
 * Lightweight item DTO for paginated list responses.
 * Does not include translations or usage examples (use VocabularyItemResponseDto for those).
 */
export class VocabularyItemSummaryResponseDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-...' })
  id!: string;

  @ApiProperty({ example: 'uuid-of-vocabulary-list' })
  vocabularyListId!: string;

  @ApiProperty({ example: 'hei' })
  word!: string;

  @ApiProperty({ example: 0 })
  position!: number;

  @ApiPropertyOptional({ example: 'noun' })
  partOfSpeech!: string | null;

  @ApiPropertyOptional({ example: '/heɪ/' })
  ipaTranscription!: string | null;

  @ApiPropertyOptional({ example: 'uuid-of-audio' })
  pronunciationAudioMediaId!: string | null;

  @ApiPropertyOptional({ example: { gender: 'neuter' } })
  grammaticalProperties!: Record<string, unknown> | null;

  @ApiPropertyOptional({ example: 'informal' })
  register!: string | null;

  @ApiPropertyOptional({ example: 'Common greeting.' })
  notes!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  @ApiPropertyOptional()
  deletedAt!: Date | null;

  static from(entity: VocabularyItemEntity): VocabularyItemSummaryResponseDto {
    const dto = new VocabularyItemSummaryResponseDto();
    dto.id = entity.id;
    dto.vocabularyListId = entity.vocabularyListId;
    dto.word = entity.word;
    dto.position = entity.position;
    dto.partOfSpeech = entity.partOfSpeech;
    dto.ipaTranscription = entity.ipaTranscription;
    dto.pronunciationAudioMediaId = entity.pronunciationAudioMediaId;
    dto.grammaticalProperties = entity.grammaticalProperties;
    dto.register = entity.register;
    dto.notes = entity.notes;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    dto.deletedAt = entity.deletedAt;
    return dto;
  }
}
