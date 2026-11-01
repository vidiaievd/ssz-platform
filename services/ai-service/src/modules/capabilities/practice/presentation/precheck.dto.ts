import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDefined, IsInt, IsNumber, IsObject, IsOptional, IsUUID, Max, Min, ValidateIf, ValidateNested } from 'class-validator';
import type { PracticeSubject } from '../application/precheck/precheck.command.js';

const SUBJECT_TEMPLATES = ['translate', 'error_correction', 'writing_task', 'short_answer', 'read_aloud'] as const;

/**
 * For the docs only: the subject is not validated at the door — its shape is the engine's, as
 * for the review queue, and the handler refuses a template it does not read.
 */
export class PracticeSubjectDto {
  @ApiProperty({ enum: SUBJECT_TEMPLATES, example: 'writing_task' })
  template!: (typeof SUBJECT_TEMPLATES)[number];
}

/** Each is required and may be null: the engine says "no limit" out loud. */
export class PrecheckLimitsDto {
  @ApiProperty({ type: Number, nullable: true, example: 3, description: 'Checks per (learner, exercise), ever; null = no limit' })
  @ValidateIf((o: PrecheckLimitsDto) => o.perExercise !== null)
  @IsInt()
  @Min(0)
  @Max(1000)
  perExercise!: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: null,
    description: 'Credits per learner per calendar month (UTC) at this school; null = no limit',
  })
  @ValidateIf((o: PrecheckLimitsDto) => o.perLearnerMonthlyCredits !== null)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  @Max(1_000_000)
  perLearnerMonthlyCredits!: number | null;
}

export class PrecheckRequestDto {
  // Any version: seeded content ids are uuidv5.
  @ApiProperty({ format: 'uuid', description: 'The school that pays (its workspace account)' })
  @IsUUID()
  schoolId!: string;

  @ApiProperty({ format: 'uuid', description: 'The learner asking' })
  @IsUUID()
  userId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  exerciseId!: string;

  @ApiProperty({ format: 'uuid', description: 'The attempt in progress; it is not changed' })
  @IsUUID()
  attemptId!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: "The course the attempt sits in; names the grammar atoms a remark may point at (plan 85). Absent = none",
  })
  @IsOptional()
  @IsUUID()
  courseId?: string | null;

  @ApiProperty({
    type: PracticeSubjectDto,
    description: 'The work in progress beside its key, as the engine builds it for `ai-review-subject`',
  })
  @IsObject()
  subject!: PracticeSubject;

  @ApiProperty({ type: PrecheckLimitsDto, description: "The school's limits, as the engine read them; the pool is the tariff's" })
  @IsDefined()
  @ValidateNested()
  @Type(() => PrecheckLimitsDto)
  limits!: PrecheckLimitsDto;
}

export class PrecheckRemainingDto {
  @ApiProperty({ type: Number, nullable: true, example: 2, description: 'Checks of this exercise left; null = no limit' })
  exercise!: number | null;
  @ApiProperty({ type: String, nullable: true, example: '4.250000', description: 'Credits left this month; null = no limit' })
  learnerCredits!: string | null;
  @ApiProperty({ type: Number, nullable: true, example: 17, description: '≈ checks those credits buy at the learner’s average' })
  learnerChecksApprox!: number | null;
}

export class AiFeedbackTargetDto {
  @ApiPropertyOptional({ type: [Number], example: [12, 15], description: 'Character offsets into that answer, end exclusive' })
  span?: [number, number];
  @ApiPropertyOptional({ example: 3, description: 'Index into `words`' })
  wordIndex?: number;
  @ApiPropertyOptional({ example: 0, description: 'Which sentence / question / passage, 0-based' })
  passageIndex?: number;
}

export class AiFeedbackItemDto {
  @ApiProperty({ enum: ['grammar', 'lexis', 'spelling', 'pronunciation', 'fluency', 'content'] }) kind!: string;
  @ApiProperty({ type: AiFeedbackTargetDto }) target!: AiFeedbackTargetDto;
  @ApiPropertyOptional({ example: 'bor', description: "The learner's fragment, verbatim" }) original?: string;
  @ApiPropertyOptional({ description: 'Never set by a rehearsal: the learner finds the fix' }) suggestion?: string;
  @ApiProperty({ example: 'Действие началось в прошлом и длится до сих пор — какое время это выражает?' }) explanation!: string;
  @ApiProperty({
    type: Object,
    nullable: true,
    example: {
      atomType: 'grammar_rule_atom',
      atomId: 'f056f89e-fac6-4ec3-bfc3-db24a23db27a',
      status: 'in_queue',
      ruleTitle: 'Inversjon',
      title: 'Verb før subjekt etter adverbial',
    },
    description: 'The grammar atom the remark is about — only one the learner has reached in the course (plan 85); else null',
  })
  atomRef!: { atomType: string; atomId: string; status?: string; ruleTitle?: string; title?: string } | null;
  @ApiProperty({ enum: ['minor', 'major'] }) severity!: string;
}

export class AiFeedbackDto {
  @ApiProperty({ example: 'Текст отвечает на задание; проверьте времена глаголов во втором абзаце.' }) summary!: string;
  @ApiProperty({ type: [AiFeedbackItemDto] }) items!: AiFeedbackItemDto[];
  @ApiPropertyOptional({ type: [Object], description: 'Voice answers only' }) words?: unknown[];
}

export class PrecheckResponseDto {
  @ApiProperty({ enum: ['ok', 'refused', 'failed'] }) status!: string;
  @ApiPropertyOptional({ type: AiFeedbackDto, description: 'When ok' }) feedback?: AiFeedbackDto;
  @ApiPropertyOptional({
    enum: ['unaskable', 'exercise_limit', 'learner_limit', 'pool_empty', 'not_available', 'template_not_supported'],
    description: 'When refused',
  })
  reason?: string;
  @ApiPropertyOptional({ type: String, nullable: true, example: 'empty_answer', description: 'When refused' }) detail?: string | null;
  @ApiPropertyOptional({ example: 'timeout', description: 'When failed' }) errorCode?: string;
  @ApiPropertyOptional({ type: [String], description: 'Ledger rows of the calls made' }) aiCallIds?: string[];
  @ApiProperty({
    type: PrecheckRemainingDto,
    nullable: true,
    description: 'What the limits leave after this request; null when they were not read',
  })
  remaining!: PrecheckRemainingDto | null;
}
