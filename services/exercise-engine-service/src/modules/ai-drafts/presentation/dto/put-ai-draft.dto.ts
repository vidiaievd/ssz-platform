import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import type { ProposedDraft } from '../../domain/entities/attempt-ai-draft.entity.js';

/** A suggested mark on one rubric criterion (step 1.7c), keyed by the attempt's rubric snapshot. */
export class AiDraftMarkDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  criterionId!: string;

  @IsIn([0, 1, 2, 3])
  mark!: 0 | 1 | 2 | 3;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  reason!: string;
}

export class AiDraftRemarkDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  itemId!: string;

  @IsInt()
  @Min(1)
  sentenceIndex!: number;

  // `alternative`: a correction the key did not foresee that is also right (error_correction),
  // or a key point said in words the phrase match missed (short_answer).
  // `task`, `structure`: about an essay as a whole (writing_task).
  // `content`: a key point an answer leaves out or gets wrong (short_answer).
  @IsIn(['grammar', 'order', 'lexis', 'register', 'alternative', 'task', 'structure', 'content'])
  aspect!: string;

  /** Null only for a remark about the text as a whole; ai-service decides which aspects may. */
  @ValidateIf((o: AiDraftRemarkDto) => o.fragment !== null)
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  fragment!: string | null;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  comment!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  suggestion!: string | null;
}

/**
 * What ai-service writes about a submission — a teacher's draft (`ai-draft`) or a learner's
 * review (`ai-review`). Wire statuses are lowercase, like every other status on the wire.
 */
export class AiDraftBodyDto {
  @IsIn(['ready', 'failed'])
  status!: 'ready' | 'failed';

  /** Empty for `failed`. */
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => AiDraftRemarkDto)
  items!: AiDraftRemarkDto[];

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  summary?: string | null;

  /** One per rubric criterion; null or absent when the model was not asked for marks. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => AiDraftMarkDto)
  marks?: AiDraftMarkDto[] | null;

  /** Required for `failed`: why there is no draft text. */
  @ValidateIf((o: AiDraftBodyDto) => o.status === 'failed' || o.errorCode != null)
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  errorCode?: string | null;

  @IsOptional() @IsUUID() providerId?: string | null;
  @IsOptional() @IsUUID() modelId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  promptVersion?: string | null;

  /** The ai-service ledger row behind this draft — the idempotency key. */
  @IsUUID()
  aiCallId!: string;
}

/** A teacher's draft. A learner's review is written with its verdict, through `ai-review`. */
export class PutAiDraftDto extends AiDraftBodyDto {
  @IsIn(['review_draft'])
  capability!: 'review_draft';
}

/** The body as storage keeps it. */
export function toProposedDraft(dto: AiDraftBodyDto): ProposedDraft {
  return {
    status: dto.status === 'ready' ? 'READY' : 'FAILED',
    // A failed call leaves no text behind, whatever was sent.
    items: dto.status === 'ready' ? dto.items.map((i) => ({ ...i, suggestion: i.suggestion ?? null })) : [],
    summary: dto.status === 'ready' ? (dto.summary ?? null) : null,
    // An empty list is no marks, as storage reads it.
    marks: dto.status === 'ready' && dto.marks && dto.marks.length > 0 ? dto.marks : null,
    errorCode: dto.errorCode ?? null,
    providerId: dto.providerId ?? null,
    modelId: dto.modelId ?? null,
    promptVersion: dto.promptVersion ?? null,
    aiCallId: dto.aiCallId,
  };
}
