import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsUUID } from 'class-validator';
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

  @ApiProperty({
    type: PracticeSubjectDto,
    description: 'The work in progress beside its key, as the engine builds it for `ai-review-subject`',
  })
  @IsObject()
  subject!: PracticeSubject;
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
  @ApiProperty({ type: Object, nullable: true, description: 'Null until plan 85' }) atomRef!: null;
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
    enum: ['unaskable', 'not_available', 'pool_empty', 'template_not_supported'],
    description: 'When refused',
  })
  reason?: string;
  @ApiPropertyOptional({ type: String, nullable: true, example: 'empty_answer', description: 'When refused' }) detail?: string | null;
  @ApiPropertyOptional({ example: 'timeout', description: 'When failed' }) errorCode?: string;
  @ApiPropertyOptional({ type: [String], description: 'Ledger rows of the calls made' }) aiCallIds?: string[];
}
