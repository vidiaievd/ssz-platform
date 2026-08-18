import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * The school whose load is being asked about, and how far back to count verdicts.
 *
 * `schoolId` is checked in the controller rather than here, for the reason the other
 * review DTOs give: the global ValidationPipe answers 400 before any route pipe runs, and
 * a review route that was not told what it may touch is a 422 like every other one here.
 */
export class AggregateReviewLoadRequestDto {
  @ApiProperty({ description: 'The school under oversight — never optional' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  schoolId?: string;

  /**
   * How far back the delivered verdicts are counted. It does not bound what is still
   * waiting: an unanswered submission from before the window is the finding, not noise.
   */
  @ApiPropertyOptional({ minimum: 1, maximum: 365, default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  periodDays?: number;
}
