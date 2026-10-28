import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

/** The keys a learner's own plan is billed for; a school's keys are the school's to read. */
export const LEARNER_USAGE_FEATURES = ['ai.review_direct', 'ai.student_assist'] as const;

export class UsageQueryDto {
  @ApiProperty({ enum: LEARNER_USAGE_FEATURES, example: 'ai.review_direct' })
  @IsIn(LEARNER_USAGE_FEATURES)
  feature!: string;
}

export class MyUsageDto {
  @ApiProperty({ enum: LEARNER_USAGE_FEATURES, example: 'ai.review_direct' })
  feature!: string;

  @ApiProperty({
    example: '12.350000',
    description: 'Credits spent this period, a decimal string with six places. May exceed `total` by the calls in flight when it ran out',
  })
  used!: string;

  @ApiProperty({ type: String, nullable: true, example: '100.000000', description: 'Credits per period; null = unmetered' })
  total!: string | null;

  @ApiProperty({ type: String, format: 'date-time', description: 'When the period ends and `used` starts again from zero' })
  periodEnd!: string;
}
