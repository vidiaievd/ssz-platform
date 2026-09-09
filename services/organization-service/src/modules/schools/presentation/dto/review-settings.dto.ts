import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, Max, Min } from 'class-validator';
import { ReviewEscalationTarget } from '../../domain/value-objects/review-settings.vo.js';

/**
 * The school's promise, set whole.
 *
 * The bounds are repeated from `ReviewSettings` rather than delegated to it: the value
 * object refuses a bad promise wherever it comes from, and these turn the common mistakes
 * into a 400 that names the field before a domain error has to.
 */
export class UpdateReviewSettingsRequestDto {
  @ApiProperty({ minimum: 1, maximum: 720, example: 48 })
  @IsInt()
  @Min(1)
  @Max(720)
  respondWithinHours!: number;

  @ApiProperty({
    minimum: 1,
    maximum: 720,
    example: 72,
    description: 'Never earlier than respondWithinHours — checked in the domain',
  })
  @IsInt()
  @Min(1)
  @Max(720)
  escalateAfterHours!: number;

  @ApiProperty({ enum: Object.values(ReviewEscalationTarget), example: 'school_admins' })
  @IsIn(Object.values(ReviewEscalationTarget))
  escalateTo!: ReviewEscalationTarget;
}

export class ReviewSettingsResponseDto {
  @ApiProperty({ example: 48 }) respondWithinHours!: number;
  @ApiProperty({ example: 72 }) escalateAfterHours!: number;
  @ApiProperty({ enum: Object.values(ReviewEscalationTarget) })
  escalateTo!: ReviewEscalationTarget;
}
