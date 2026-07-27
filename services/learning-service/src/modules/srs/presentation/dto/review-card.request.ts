import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import type { ReviewRatingValue } from '../../domain/value-objects/review-rating.vo.js';
import type { SrsContentType, SrsSeedKind } from '../../domain/entities/review-card.entity.js';

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

  @ApiPropertyOptional({
    description:
      'Preferred translation language for the resolved content of VOCABULARY_WORD cards ' +
      '(BCP-47). Falls back to another available language server-side, flagged via ' +
      '`back.fallbackUsed`.',
    default: 'en',
    example: 'ru',
  })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  language?: string;

  @ApiPropertyOptional({
    description: 'Include usage examples in each vocabulary card’s content.',
    default: false,
    example: true,
  })
  @IsOptional()
  // Query strings arrive as text; Type(() => Boolean) would turn 'false' into true.
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeExamples?: boolean;
}

export class IntroduceCardRequest {
  @ApiProperty({
    enum: ['EXERCISE', 'VOCABULARY_WORD'],
    description: 'Type of content this card tracks',
    example: 'VOCABULARY_WORD',
  })
  @IsEnum(['EXERCISE', 'VOCABULARY_WORD'])
  contentType!: SrsContentType;

  @ApiProperty({ format: 'uuid', description: 'ID of the content item to introduce' })
  @IsUUID()
  contentId!: string;

  @ApiPropertyOptional({
    enum: ['DIAGNOSTIC_KNOWN', 'CLAIMED_KNOWN'],
    description:
      'Skip-known seed path (plan 21 §4): seeds the card directly in REVIEW instead of NEW. ' +
      'DIAGNOSTIC_KNOWN = confirmed by a placement test; CLAIMED_KNOWN = self-declared via the ' +
      'vocabulary-list tap-through. Omit for ordinary (non-skip) introduction.',
    example: 'CLAIMED_KNOWN',
  })
  @IsOptional()
  @IsEnum(['DIAGNOSTIC_KNOWN', 'CLAIMED_KNOWN'])
  seedKind?: SrsSeedKind;
}

export class BulkIntroduceRequest {
  @ApiProperty({ format: 'uuid', description: 'Vocabulary list whose items should be introduced' })
  @IsUUID()
  vocabularyListId!: string;

  @ApiPropertyOptional({
    enum: ['DIAGNOSTIC_KNOWN', 'CLAIMED_KNOWN'],
    description: 'See IntroduceCardRequest.seedKind. Applied uniformly to every item in the list.',
    example: 'CLAIMED_KNOWN',
  })
  @IsOptional()
  @IsEnum(['DIAGNOSTIC_KNOWN', 'CLAIMED_KNOWN'])
  seedKind?: SrsSeedKind;
}
