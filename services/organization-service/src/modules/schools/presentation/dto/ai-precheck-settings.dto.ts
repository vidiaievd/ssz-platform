import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsInt, Max, Min, ValidateIf } from 'class-validator';

/**
 * Whether the school's learners may have a model check their work before they hand it in,
 * set whole: a limit left out is not "unchanged", send null for no limit.
 */
export class UpdateAiPrecheckSettingsRequestDto {
  @ApiProperty({
    example: true,
    description: 'Turning it on needs the plan feature ai.practice; turning it off never does',
  })
  @IsBoolean()
  enabled!: boolean;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 3,
    description: 'Checks per learner and exercise, ever — a new attempt does not reset it; null = no limit',
  })
  @ValidateIf((o: UpdateAiPrecheckSettingsRequestDto) => o.perExerciseLimit !== null)
  @IsInt()
  @Min(1)
  @Max(1000)
  perExerciseLimit!: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: null,
    description:
      "Credits per learner per calendar month; null = no limit of the school's own. " +
      "The plan's ai.practice perLearnerMonthlyCredits stays the ceiling.",
  })
  @ValidateIf((o: UpdateAiPrecheckSettingsRequestDto) => o.perLearnerMonthlyCredits !== null)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  perLearnerMonthlyCredits!: number | null;
}

export class AiPrecheckSettingsResponseDto {
  @ApiProperty({ description: 'As saved; whether the plan still allows it is checked when a check is asked for' })
  enabled!: boolean;

  @ApiProperty({ type: Number, nullable: true, example: 3 }) perExerciseLimit!: number | null;

  @ApiProperty({ type: Number, nullable: true, example: null }) perLearnerMonthlyCredits!: number | null;
}
