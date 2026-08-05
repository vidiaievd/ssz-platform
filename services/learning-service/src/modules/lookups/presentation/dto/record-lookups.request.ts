import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsISO8601,
  IsUUID,
  ValidateNested,
} from 'class-validator';

/**
 * Upper bound per request. The reader flushes every 10 seconds and dedupes per
 * word, so a batch is bounded by the glossed words of one text; the cap keeps a
 * malfunctioning client from publishing an unbounded burst of events.
 */
export const LOOKUPS_MAX_PER_REQUEST = 50;

export class LookupEntryRequest {
  @ApiProperty({ format: 'uuid', description: 'Lesson being read' })
  @IsUUID()
  lessonId!: string;

  @ApiProperty({
    format: 'uuid',
    description: 'Variant served to the reader — glossing differs per variant',
  })
  @IsUUID()
  lessonVariantId!: string;

  @ApiProperty({ format: 'uuid', description: 'Vocabulary item whose card was opened' })
  @IsUUID()
  vocabularyItemId!: string;

  @ApiProperty({
    enum: ['preview', 'full'],
    description: 'How far the card was opened: a hover hint, or the full card',
    example: 'full',
  })
  @IsIn(['preview', 'full'])
  level!: 'preview' | 'full';

  @ApiProperty({
    format: 'date-time',
    description:
      'When the learner opened the card. Batching makes this differ from the receive time; ' +
      'a value in the future or older than 24h is replaced with the receive time.',
    example: '2026-07-31T09:14:22.031Z',
  })
  @IsISO8601()
  occurredAt!: string;
}

export class RecordLookupsRequest {
  @ApiProperty({
    type: [LookupEntryRequest],
    maxItems: LOOKUPS_MAX_PER_REQUEST,
    description: `Word-card openings, at most ${LOOKUPS_MAX_PER_REQUEST} per request.`,
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(LOOKUPS_MAX_PER_REQUEST)
  @ValidateNested({ each: true })
  @Type(() => LookupEntryRequest)
  lookups!: LookupEntryRequest[];
}
