import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
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

  @ApiProperty({ enum: ['approved', 'returned'] })
  @IsIn(['approved', 'returned'])
  outcome!: 'approved' | 'returned';

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
}
