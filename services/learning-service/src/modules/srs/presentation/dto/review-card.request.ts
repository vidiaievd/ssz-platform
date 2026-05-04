import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsISO8601, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import type { ReviewRatingValue } from '../../domain/value-objects/review-rating.vo.js';

export class ReviewCardRequest {
  @ApiProperty({
    enum: ['AGAIN', 'HARD', 'GOOD', 'EASY'],
    description: 'User-facing review rating. Maps 1:1 to FSRS grades (Again=1 … Easy=4).',
    example: 'GOOD',
  })
  @IsEnum(['AGAIN', 'HARD', 'GOOD', 'EASY'])
  rating!: ReviewRatingValue;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Timestamp of the review. Defaults to server time if omitted.',
    example: '2026-04-29T10:00:00.000Z',
  })
  @IsOptional()
  @IsISO8601()
  reviewedAt?: string;
}

export class GetDueCardsRequest {
  @ApiPropertyOptional({
    description: 'Maximum number of due cards to return.',
    minimum: 1,
    maximum: 100,
    default: 20,
    example: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
