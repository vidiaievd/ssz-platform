import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsEnum, IsUUID } from 'class-validator';
import type { SrsContentType } from '../../domain/entities/review-card.entity.js';
import type { CardStatesEnvelope, SrsCardStateDto } from '../../application/dto/srs.dto.js';

/**
 * Upper bound on ids per request. A unit's full glossary is well under this;
 * the cap keeps the IN clause and the response bounded.
 */
export const CARD_STATES_MAX_IDS = 500;

export class GetCardStatesRequest {
  @ApiProperty({
    enum: ['EXERCISE', 'EXERCISE_GAP', 'VOCABULARY_WORD'],
    description: 'Type of content the requested cards track',
    example: 'VOCABULARY_WORD',
  })
  @IsEnum(['EXERCISE', 'EXERCISE_GAP', 'VOCABULARY_WORD'])
  contentType!: SrsContentType;

  @ApiProperty({
    type: [String],
    format: 'uuid',
    maxItems: CARD_STATES_MAX_IDS,
    description: `Content ids to look up, at most ${CARD_STATES_MAX_IDS} per request.`,
    example: [
      'eb1aa566-c4e0-4ffa-8018-e9ce2abc5d08',
      '9f1c2f0e-6a2b-4d0e-8f3a-2d5f4a1b7c33',
    ],
  })
  // An empty array is allowed and answers with an empty list — the caller does
  // not have to special-case a text with no glossed words.
  @IsArray()
  @ArrayMaxSize(CARD_STATES_MAX_IDS)
  @IsUUID(undefined, { each: true })
  contentIds!: string[];
}

export class SrsCardStateResponse implements SrsCardStateDto {
  @ApiProperty({ format: 'uuid', description: 'ID of the tracked content item' })
  contentId!: string;

  @ApiProperty({
    enum: ['NEW', 'LEARNING', 'REVIEW', 'RELEARNING', 'SUSPENDED'],
    description: 'Current FSRS state',
    example: 'REVIEW',
  })
  state!: string;

  @ApiProperty({ description: 'FSRS stability value in days (memory strength)', example: 21.4 })
  stability!: number;

  @ApiProperty({
    format: 'date-time',
    description: 'Next review due date (ISO 8601)',
    example: '2026-05-05T08:00:00.000Z',
  })
  dueAt!: string;
}

export class CardStatesResponse implements CardStatesEnvelope {
  @ApiProperty({
    type: [SrsCardStateResponse],
    description:
      'One entry per requested content id that has a card. Ids without a card are omitted — ' +
      'the client treats them as NEW.',
  })
  states!: SrsCardStateResponse[];
}
