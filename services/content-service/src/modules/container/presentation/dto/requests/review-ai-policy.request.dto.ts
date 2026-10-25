import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsInt, Matches, Max, Min, ValidateIf } from 'class-validator';

/**
 * The course's part of the school's review policy, set whole (plan 80). Both fields are
 * required: `null` for the term is "inherit the school's", an absent field is a mistake —
 * the same rule as the response promise next door.
 */
export class SetContainerReviewAiPolicyRequestDto {
  @ApiProperty({
    minimum: 1,
    maximum: 720,
    nullable: true,
    example: 72,
    description:
      'Hours after which a model’s verdict counts by itself if no teacher answered; null inherits ' +
      'the school’s. A term below the school’s escalation is raised to it on read',
  })
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(1)
  @Max(720)
  autoAcceptAfterHours!: number | null;

  @ApiProperty({
    type: [String],
    example: ['writing_task', 'read_aloud'],
    description: 'Exercise template codes whose work always goes to a teacher when the school samples',
  })
  @IsArray()
  @ArrayMaxSize(50)
  @Matches(/^[a-z][a-z0-9_]{1,63}$/, { each: true })
  teacherReviewTemplates!: string[];
}
