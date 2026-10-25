import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsObject, IsOptional, Max, Min, ValidateIf } from 'class-validator';
import { ReviewEscalationTarget } from '../../domain/value-objects/review-settings.vo.js';
import { ReviewAiMode } from '../../domain/value-objects/review-ai-policy.vo.js';

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

/** Who answers the school's work first (plan 80), set whole. */
export class UpdateReviewAiPolicyRequestDto {
  @ApiProperty({
    enum: Object.values(ReviewAiMode),
    example: 'ai_then_teacher',
    description:
      'teacher_only — the teacher alone; ai_then_teacher — a model answers, the teacher confirms ' +
      'or the model’s verdict counts after autoAcceptAfterHours; ai_with_sampling — the model’s ' +
      'verdict counts, failed and disputed work plus samplePercent of the rest go to the teacher. ' +
      'Both modes with a model need the plan feature school.review_ai_policy',
  })
  @IsIn(Object.values(ReviewAiMode))
  mode!: ReviewAiMode;

  @ApiProperty({
    minimum: 1,
    maximum: 720,
    example: 168,
    description: 'In a mode with a model, never earlier than escalateAfterHours — checked in the domain',
  })
  @IsInt()
  @Min(1)
  @Max(720)
  autoAcceptAfterHours!: number;

  @ApiProperty({ minimum: 0, maximum: 100, example: 15, description: 'Share of ai_with_sampling work sent to the teacher at random' })
  @IsInt()
  @Min(0)
  @Max(100)
  samplePercent!: number;
}

export class ReviewAiPolicyResponseDto {
  @ApiProperty({ enum: Object.values(ReviewAiMode) }) mode!: ReviewAiMode;
  @ApiProperty({ example: 168 }) autoAcceptAfterHours!: number;
  @ApiProperty({ example: 15 }) samplePercent!: number;
}

/**
 * The minutes per submission a school sets (plan 81, Q5), whole. Each template's figure is
 * checked by `ReviewEffortMinutes` — a map's values are past what a decorator can name.
 */
export class UpdateReviewEffortMinutesRequestDto {
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'integer', minimum: 1, maximum: 120 },
    example: { writing_task: 15, short_answer: 2 },
    description: 'Minutes per submission by template code; a template left out follows the factory value',
  })
  @IsObject()
  templates!: Record<string, number>;

  @ApiProperty({
    required: false,
    nullable: true,
    minimum: 1,
    maximum: 120,
    example: 3,
    description: 'Minutes for a template on neither list; null or absent — the factory value',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(1)
  @Max(120)
  other?: number | null;
}

export class ReviewEffortMinutesEntryDto {
  @ApiProperty({ example: 'writing_task' }) templateCode!: string;
  @ApiProperty({ example: 12 }) minutes!: number;
  @ApiProperty({ enum: ['school', 'default'], description: 'Set by the school, or the factory value' })
  source!: 'school' | 'default';
}

export class ReviewEffortMinutesOtherDto {
  @ApiProperty({ example: 3 }) minutes!: number;
  @ApiProperty({ enum: ['school', 'default'] }) source!: 'school' | 'default';
}

export class ReviewEffortMinutesResponseDto {
  @ApiProperty({ type: [ReviewEffortMinutesEntryDto] }) templates!: ReviewEffortMinutesEntryDto[];
  @ApiProperty({ type: ReviewEffortMinutesOtherDto }) other!: ReviewEffortMinutesOtherDto;
}
