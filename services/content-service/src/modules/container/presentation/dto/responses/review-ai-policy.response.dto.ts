import { ApiProperty } from '@nestjs/swagger';
import type { ContainerReviewAiPolicyResult } from '../../../application/queries/get-review-ai-policy/get-container-review-ai-policy.handler.js';

const MODES = ['teacher_only', 'ai_then_teacher', 'ai_with_sampling'];

export class ContainerReviewAiPolicyResponseDto {
  @ApiProperty({ nullable: true, example: 168, description: 'What actually applies' })
  autoAcceptAfterHours!: number | null;

  @ApiProperty({ nullable: true, example: 168, description: 'The school’s term — what "inherit" means' })
  inheritedAutoAcceptAfterHours!: number | null;

  @ApiProperty({ example: false })
  overridden!: boolean;

  @ApiProperty({
    nullable: true,
    example: 72,
    description: 'The school’s escalation; a course term below it is raised to it',
  })
  escalationFloorHours!: number | null;

  @ApiProperty({ type: [String], example: ['writing_task'] })
  teacherReviewTemplates!: string[];

  @ApiProperty({ enum: MODES, nullable: true, description: 'The school’s mode' })
  schoolMode!: ContainerReviewAiPolicyResult['schoolMode'];

  @ApiProperty({ nullable: true, example: 15, description: 'The school’s sampling share' })
  samplePercent!: number | null;

  static from(result: ContainerReviewAiPolicyResult): ContainerReviewAiPolicyResponseDto {
    return { ...result, teacherReviewTemplates: [...result.teacherReviewTemplates] };
  }
}
