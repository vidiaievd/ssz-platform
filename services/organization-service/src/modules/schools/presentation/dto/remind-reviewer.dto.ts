import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Max, Min, MinLength } from 'class-validator';

/**
 * Who to remind, and how much is waiting on them.
 *
 * The count travels in the request because this service does not hold it: what is waiting
 * lives in exercise-engine, and the caller has just finished composing the very screen the
 * number is read from (plan 46 §46.1). It is a figure for the message, never a decision —
 * nothing here is authorised by it.
 */
export class RemindReviewerRequestDto {
  @ApiProperty({ example: 'a3f1…' })
  @IsString()
  @MinLength(1)
  teacherId!: string;

  @ApiProperty({ example: 12, minimum: 0, maximum: 100000 })
  @IsInt()
  @Min(0)
  @Max(100000)
  pending!: number;
}

export class RemindReviewerResponseDto {
  @ApiProperty({ example: true })
  sent!: true;
}
