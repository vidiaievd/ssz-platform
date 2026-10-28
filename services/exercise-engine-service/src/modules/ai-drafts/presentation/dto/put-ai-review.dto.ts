import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDefined,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import type { PromptHearing } from '../../domain/reading-verdict.js';
import { AiDraftBodyDto } from './put-ai-draft.dto.js';

export class AiItemDecisionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  itemId!: string;

  @IsBoolean()
  approved!: boolean;
}

/**
 * The model's ruling. `decisions` covers the items the machine left open; any it sends on an
 * item the machine closed is not read (Q4-C). For an essay the marks in the body are the
 * ruling, and `outcome` is not read either.
 */
export class AiVerdictDto {
  @IsIn(['approved', 'returned'])
  outcome!: 'approved' | 'returned';

  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => AiItemDecisionDto)
  decisions!: AiItemDecisionDto[];
}

/** One word heard, where in the recording (ai-service `HeardWord`). */
export class HeardWordDto {
  @IsString()
  @MaxLength(200)
  text!: string;

  @IsInt()
  @Min(0)
  startMs!: number;

  @IsInt()
  @Min(0)
  endMs!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number | null;
}

export class PronouncedWordDto {
  @IsString()
  @MaxLength(200)
  text!: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  accuracy!: number;

  @IsIn(['none', 'mispronunciation', 'omission', 'insertion'])
  error!: 'none' | 'mispronunciation' | 'omission' | 'insertion';
}

/** Pronunciation scores, 0–100 — feedback only (plan 82 §2.3). */
export class PronunciationScoresDto {
  @IsNumber() @Min(0) @Max(100) accuracy!: number;
  @IsNumber() @Min(0) @Max(100) fluency!: number;
  @IsNumber() @Min(0) @Max(100) completeness!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  prosody?: number | null;

  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => PronouncedWordDto)
  words!: PronouncedWordDto[];
}

/** What the recognizer heard in one prompt's recording. */
export class PromptHearingDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  itemId!: string;

  /** The lexical form where the provider has one; empty when it heard nothing. */
  @IsString()
  @MaxLength(10000)
  transcript!: string;

  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => HeardWordDto)
  words!: HeardWordDto[];

  @IsOptional()
  @IsInt()
  @Min(0)
  audioMs?: number | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => PronunciationScoresDto)
  pronunciation?: PronunciationScoresDto | null;

  /** The ledger row of the call that heard this prompt; the review's own `aiCallId` is the first prompt's. */
  @IsOptional()
  @IsUUID()
  aiCallId?: string | null;
}

/** A `read_aloud` reading (plan 82, step 7): what was heard, prompt by prompt. */
export class ReadingHearingDto {
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => PromptHearingDto)
  prompts!: PromptHearingDto[];
}

/**
 * A learner's review (plan 79, step 2.1b): the draft body plus, when `ready`, its verdict —
 * or, for a `read_aloud` (plan 82, step 7), what was heard, from which the engine rules.
 */
export class PutAiReviewDto extends AiDraftBodyDto {
  /** Required for `ready` unless `reading` is sent; not read for `failed`. */
  @ValidateIf((o: PutAiReviewDto) => o.status === 'ready' && o.reading === undefined)
  @IsDefined()
  @ValidateNested()
  @Type(() => AiVerdictDto)
  verdict?: AiVerdictDto;

  /** `read_aloud` only, in place of `verdict`; not read for `failed`. */
  @IsOptional()
  @ValidateNested()
  @Type(() => ReadingHearingDto)
  reading?: ReadingHearingDto;
}

/** What was heard, as the command takes it. */
export function toHearings(dto: ReadingHearingDto): PromptHearing[] {
  return dto.prompts.map((p) => ({
    itemId: p.itemId,
    transcript: p.transcript,
    words: p.words.map((w) => ({ text: w.text, startMs: w.startMs, endMs: w.endMs, confidence: w.confidence ?? null })),
    audioMs: p.audioMs ?? null,
    pronunciation: p.pronunciation
      ? {
          accuracy: p.pronunciation.accuracy,
          fluency: p.pronunciation.fluency,
          completeness: p.pronunciation.completeness,
          prosody: p.pronunciation.prosody ?? null,
          words: p.pronunciation.words.map((w) => ({ text: w.text, accuracy: w.accuracy, error: w.error })),
        }
      : null,
    aiCallId: p.aiCallId ?? null,
  }));
}
