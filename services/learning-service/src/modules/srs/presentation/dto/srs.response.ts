import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { ReviewCardDto, SrsStatsDto } from '../../application/dto/srs.dto.js';

export class ReviewCardResponse implements ReviewCardDto {
  @ApiProperty({ format: 'uuid', description: 'Review card ID' })
  id!: string;

  @ApiProperty({ format: 'uuid', description: 'Owner user ID' })
  userId!: string;

  @ApiProperty({
    enum: ['EXERCISE', 'VOCABULARY_WORD'],
    description: 'Type of content this card tracks',
    example: 'EXERCISE',
  })
  contentType!: string;

  @ApiProperty({ format: 'uuid', description: 'ID of the tracked content item' })
  contentId!: string;

  @ApiProperty({
    enum: ['NEW', 'LEARNING', 'REVIEW', 'RELEARNING', 'SUSPENDED'],
    description: 'Current FSRS state',
    example: 'REVIEW',
  })
  state!: string;

  @ApiProperty({
    format: 'date-time',
    description: 'Next review due date (ISO 8601)',
    example: '2026-05-05T08:00:00.000Z',
  })
  dueAt!: string;

  @ApiProperty({ description: 'FSRS stability value (memory strength)', example: 4.07 })
  stability!: number;

  @ApiProperty({ description: 'FSRS difficulty value (1–10)', example: 5.0 })
  difficulty!: number;

  @ApiProperty({ description: 'Days until next scheduled review', example: 7 })
  scheduledDays!: number;

  @ApiProperty({ description: 'Total number of reviews', example: 3 })
  reps!: number;

  @ApiProperty({ description: 'Number of lapses (REVIEW → AGAIN transitions)', example: 0 })
  lapses!: number;

  @ApiPropertyOptional({ format: 'date-time', nullable: true, description: 'Last review timestamp' })
  lastReviewedAt!: string | null;

  @ApiProperty({ format: 'date-time', description: 'Card creation timestamp' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time', description: 'Last update timestamp' })
  updatedAt!: string;
}

export class SrsStatsResponse implements SrsStatsDto {
  @ApiProperty({ description: 'Cards in NEW state (never reviewed)', example: 15 })
  newCount!: number;

  @ApiProperty({ description: 'Cards in LEARNING state', example: 5 })
  learningCount!: number;

  @ApiProperty({ description: 'Cards in REVIEW state (graduated from learning)', example: 42 })
  reviewCount!: number;

  @ApiProperty({ description: 'Cards in RELEARNING state (lapsed)', example: 2 })
  relearningCount!: number;

  @ApiProperty({ description: 'Cards manually suspended', example: 1 })
  suspendedCount!: number;

  @ApiProperty({ description: 'Cards due right now (not suspended)', example: 8 })
  dueNowCount!: number;

  @ApiProperty({ description: 'Reviews completed today (UTC)', example: 24 })
  reviewedTodayCount!: number;
}

export class BulkIntroduceResponse {
  @ApiProperty({ description: 'Number of new SRS cards created', example: 18 })
  introduced!: number;

  @ApiProperty({
    description: 'Number of items skipped (already exist or daily limit hit)',
    example: 2,
  })
  skipped!: number;
}
