import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min, ValidateIf } from 'class-validator';

/**
 * The course's own response promise, or `null` to go back to the school's.
 *
 * `ValidateIf` rather than `IsOptional`: null is a meaningful value here and must survive
 * validation, while an absent field is a request that says nothing and is rejected —
 * "clear it" and "I forgot to send it" cannot be the same request on a route whose whole
 * subject is one number (criterion 35).
 */
export class SetContainerReviewSettingsRequestDto {
  @ApiProperty({
    minimum: 1,
    maximum: 720,
    nullable: true,
    example: 24,
    description: 'Hours; null inherits the school’s promise',
  })
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(1)
  @Max(720)
  respondWithinHours!: number | null;
}
