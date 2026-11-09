import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Allow } from 'class-validator';

export class CheckAttemptRequestDto {
  @ApiProperty({
    description:
      'The work so far, in the same shape a submission carries. error_correction: ' +
      '{ items: { <itemId>: { marked, fix, ins } } }. translate_*: { answers: [{ itemId, text }] }. ' +
      'writing_task: { text, ticked }. short_answer: { answers: [{ questionId, text }] } — questions ' +
      'already answered are ignored. read_aloud: { recordings: [{ itemId, assetId, seconds, takes }] } — ' +
      'the takes recorded so far; prompts without one are not heard. Nothing is submitted.',
  })
  @Allow()
  draftAnswer!: unknown;
}

export class CheckAiOutcomeDto {
  @ApiProperty({ enum: ['ok', 'refused', 'failed', 'not_asked'] })
  status!: string;

  @ApiPropertyOptional({
    description:
      'refused (by ai-service): unaskable | exercise_limit | learner_limit | pool_empty | not_available | ' +
      'template_not_supported. not_asked (by the engine): key_settles — the key alone settles the draft; ' +
      'no_school | disabled | not_entitled | access_unknown — no model for this school; template_not_supported.',
    example: 'exercise_limit',
  })
  reason?: string;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'refused: what was missing', example: 'empty_answer' })
  detail?: string | null;

  @ApiPropertyOptional({
    description: 'failed: the provider’s code, recording_missing | recording_not_ready | …, or ai_unavailable',
    example: 'timeout',
  })
  errorCode?: string;
}

export class CheckRemainingDto {
  @ApiProperty({ type: Number, nullable: true, example: 2, description: 'Checks of this exercise left; null = no limit' })
  exercise!: number | null;

  @ApiProperty({ type: String, nullable: true, example: '4.250000', description: 'Credits left this month; null = no limit' })
  learnerCredits!: string | null;

  @ApiProperty({ type: Number, nullable: true, example: 17, description: '≈ checks those credits buy — what the learner is shown' })
  learnerChecksApprox!: number | null;
}

export class PrecheckPromptReadingDto {
  @ApiProperty()
  itemId!: string;

  @ApiProperty({ example: 86, description: 'Whole percent of the passage’s words read' })
  percent!: number;

  @ApiProperty({ description: 'The share reaches the author’s mark' })
  passed!: boolean;

  @ApiProperty({
    type: Object,
    description: 'The kernel’s ReadingCheck: ops word by word (read / misread / missed / extra) and the counts',
  })
  check!: unknown;
}

export class PrecheckReadingDto {
  @ApiProperty({ example: 80 })
  passPercent!: number;

  @ApiProperty({ type: [PrecheckPromptReadingDto] })
  prompts!: PrecheckPromptReadingDto[];

  @ApiProperty({ type: [String], description: 'Carried from a returned try, not heard now' })
  carriedItemIds!: string[];
}

export class CheckAttemptResponseDto {
  @ApiProperty()
  attemptId!: string;

  @ApiProperty({ example: 'writing_task' })
  templateCode!: string;

  @ApiProperty({
    format: 'uuid',
    nullable: true,
    description: 'The course the attempt belongs to; the client passes it to `POST srs/atoms/:atomId/add` (plan 85)',
  })
  courseId!: string | null;

  @ApiProperty({
    type: Object,
    nullable: true,
    description:
      'error_correction / translate_*: the deterministic self-check, exactly as `self-check` answers it ' +
      '(less attemptId). Null for other templates, or when the author’s self-checks are spent.',
  })
  selfCheck!: unknown;

  @ApiProperty({ type: CheckAiOutcomeDto })
  ai!: CheckAiOutcomeDto;

  @ApiProperty({
    type: Object,
    nullable: true,
    description:
      'AiFeedback (packages/contracts): { summary, items[{ kind, target, original?, explanation, atomRef: { atomType, atomId, status, ruleTitle, title } | null, ' +
      'severity }], words? }. Hints, never the fix or the key. A reading carries only `words`. Null unless ai.status is ok.',
  })
  feedback!: unknown;

  @ApiProperty({ type: PrecheckReadingDto, nullable: true, description: 'read_aloud with ai.status ok' })
  reading!: PrecheckReadingDto | null;

  @ApiProperty({
    type: CheckRemainingDto,
    nullable: true,
    description: 'What the school’s limits leave; null when no model was asked or the limits were not read',
  })
  remaining!: CheckRemainingDto | null;
}
