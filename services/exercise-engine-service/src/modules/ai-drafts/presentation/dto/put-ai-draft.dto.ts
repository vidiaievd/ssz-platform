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
import { AI_DRAFT_CAPABILITIES, type AiDraftCapability } from '../../domain/entities/attempt-ai-draft.entity.js';

export class AiDraftRemarkDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  itemId!: string;

  @IsInt()
  @Min(1)
  sentenceIndex!: number;

  // `alternative`: a correction the key did not foresee that is also right (error_correction).
  // `task`, `structure`: about an essay as a whole (writing_task).
  @IsIn(['grammar', 'order', 'lexis', 'register', 'alternative', 'task', 'structure'])
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

/** What ai-service writes. Wire statuses are lowercase, like every other status on the wire. */
export class PutAiDraftDto {
  @IsIn(AI_DRAFT_CAPABILITIES)
  capability!: AiDraftCapability;

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

  /** Required for `failed`: why there is no draft text. */
  @ValidateIf((o: PutAiDraftDto) => o.status === 'failed' || o.errorCode != null)
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
