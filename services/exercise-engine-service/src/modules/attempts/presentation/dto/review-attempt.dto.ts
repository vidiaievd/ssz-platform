import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/** What the teacher decided about one sentence of a submission. */
export class ReviewDecisionDto {
  @ApiProperty({ example: 'i7f3a1b2' })
  @IsString()
  itemId!: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  approved!: boolean;

  @ApiPropertyOptional({ example: 'Riktig, men «bor» er presens — oppgaven ber om perfektum.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}

export class ReviewAttemptRequestDto {
  /**
   * Who marked it. Sent by the caller rather than read from a token: these routes are
   * service-to-service, and the BFF has already established the teacher's identity and
   * their right to mark this exercise.
   */
  @ApiProperty({ example: 'uuid-of-teacher' })
  @IsString()
  reviewerId!: string;

  /**
   * `approved_comment` is accepted as a spelling of `approved`.
   *
   * The screen has three verdicts and the engine has two: an approval with something
   * written on it is still an approval, and what the learner is told apart by travels on
   * the event as `hasComment` (plan 44 §44.9). Taking the screen's word verbatim spares
   * every caller a mapping it can get wrong.
   */
  @ApiProperty({ enum: ['approved', 'approved_comment', 'returned'] })
  @IsIn(['approved', 'approved_comment', 'returned'])
  outcome!: 'approved' | 'approved_comment' | 'returned';

  @ApiPropertyOptional({ type: [ReviewDecisionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReviewDecisionDto)
  decisions?: ReviewDecisionDto[];

  @ApiPropertyOptional({ description: 'The teacher’s word on the submission as a whole' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  comment?: string;

  /**
   * A note against one sentence, keyed by item id — what the screen writes in the margin.
   * Folded into `decisions` on arrival; blanks and non-strings are dropped there.
   */
  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { type: 'string' },
    example: { i2: '«bor» er presens — oppgaven ber om perfektum.' },
  })
  @IsOptional()
  @IsObject()
  sentenceComments?: Record<string, string>;
}
