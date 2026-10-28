import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength, ValidateNested } from 'class-validator';
import type { AssistContext, AssistContextKind } from '../domain/assist-answer.js';
import type { AssistRefusal } from '../application/assist-refusal.js';

const CONTEXT_KINDS: readonly AssistContextKind[] = ['free', 'unit', 'submission', 'class', 'word'];
const REFUSALS: readonly AssistRefusal[] = ['no_key', 'policy', 'quota', 'disabled', 'no_binding'];

/** §3: at most this many earlier turns, and this many characters in them together. */
export const MAX_HISTORY_TURNS = 10;
export const MAX_HISTORY_CHARS = 4000;
export const MAX_MESSAGE_CHARS = 1000;
export const MAX_FEEDBACK_REASON_CHARS = 500;

/**
 * What the learner is looking at. Which ids a kind needs is the server's to check (422):
 * `unit` — courseId + unitId, `submission` — attemptId, `class` — lessonId, `word` — lemma.
 * Ids are not trusted: the course of a submission is its attempt's, whatever is sent.
 */
export class AssistContextDto {
  @ApiProperty({ enum: CONTEXT_KINDS, example: 'unit' })
  @IsIn(CONTEXT_KINDS)
  kind!: AssistContextKind;

  @ApiPropertyOptional({ format: 'uuid', description: 'The course of a unit or word; ignored for a submission' })
  @IsOptional()
  @IsUUID()
  courseId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'The unit open on screen (`unit`)' })
  @IsOptional()
  @IsUUID()
  unitId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'The learner’s own reviewed submission (`submission`)' })
  @IsOptional()
  @IsUUID()
  attemptId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'The exercise the submission or the question is about' })
  @IsOptional()
  @IsUUID()
  exerciseId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'The scheduled class session (`class`)' })
  @IsOptional()
  @IsUUID()
  lessonId?: string;

  @ApiPropertyOptional({ example: 'bolig', description: 'The word asked about (`word`)' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lemma?: string;
}

export class AssistHistoryTurnDto {
  @ApiProperty({ enum: ['user', 'assistant'], example: 'user' })
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @ApiProperty({ example: 'Hva betyr «leilighet»?' })
  @IsString()
  @MaxLength(MAX_HISTORY_CHARS)
  text!: string;
}

export class AskAssistantDto {
  @ApiProperty({ type: AssistContextDto })
  @ValidateNested()
  @Type(() => AssistContextDto)
  context!: AssistContextDto;

  @ApiProperty({
    type: [AssistHistoryTurnDto],
    description: `Earlier turns of the thread the phone keeps, oldest first: ≤ ${MAX_HISTORY_TURNS} turns, ≤ ${MAX_HISTORY_CHARS} characters together`,
  })
  @IsArray()
  @ArrayMaxSize(MAX_HISTORY_TURNS)
  @ValidateNested({ each: true })
  @Type(() => AssistHistoryTurnDto)
  history!: AssistHistoryTurnDto[];

  @ApiProperty({ example: 'Hvorfor står verbet før subjektet her?', maxLength: MAX_MESSAGE_CHARS })
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_MESSAGE_CHARS)
  message!: string;
}

/** `availability` reads the same context from the query string. */
export class AssistAvailabilityQueryDto extends AssistContextDto {}

export function toAssistContext(dto: AssistContextDto): AssistContext {
  const context: AssistContext = { kind: dto.kind };
  if (dto.courseId) context.courseId = dto.courseId;
  if (dto.unitId) context.unitId = dto.unitId;
  if (dto.attemptId) context.attemptId = dto.attemptId;
  if (dto.exerciseId) context.exerciseId = dto.exerciseId;
  if (dto.lessonId) context.lessonId = dto.lessonId;
  if (dto.lemma) context.lemma = dto.lemma;
  return context;
}

export class AssistAvailabilityDto {
  @ApiProperty({ example: true })
  available!: boolean;

  @ApiPropertyOptional({
    enum: REFUSALS,
    description:
      'Why not: `no_key` — the payer’s plan lacks `ai.student_assist`, `policy` — the payer switched AI off or its ' +
      'region is not served, `quota` — this period’s credits are spent, `disabled` — the assistant is switched off, ' +
      '`no_binding` — no model is bound. Absent when it could not be checked.',
  })
  reason?: AssistRefusal;
}

export class AssistBlockDto {
  @ApiProperty({ enum: ['text', 'example'] })
  type!: 'text' | 'example';

  @ApiProperty({ example: 'I spørsmål kommer verbet før subjektet.' })
  text!: string;

  @ApiPropertyOptional({
    type: 'array',
    items: { type: 'array', items: { type: 'integer' }, minItems: 2, maxItems: 2 },
    example: [[2, 12]],
    description: 'Spans of `text` to stress, `[start, end)` in UTF-16 code units',
  })
  emphasis?: [number, number][];
}

export class AssistCitationDto {
  @ApiProperty({ enum: ['grammar_rule', 'lesson', 'vocabulary_item', 'unit'] })
  kind!: string;

  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Inversjon', description: 'From the course, never from the model' })
  title!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  unitId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  courseId?: string;
}

export class AssistSuggestionDto {
  @ApiProperty({
    enum: ['ask', 'add_word', 'open'],
    description: '`ask` — a follow-up question (`text`); `add_word` — offer «My words» (`lemma`, `translation?`), which the client saves itself; `open` — a cited source (`target`)',
  })
  kind!: 'ask' | 'add_word' | 'open';

  @ApiPropertyOptional({ example: 'Gi meg et eksempel til' })
  text?: string;

  @ApiPropertyOptional({ example: 'leilighet' })
  lemma?: string;

  @ApiPropertyOptional({ example: 'квартира' })
  translation?: string;

  @ApiPropertyOptional({ type: AssistCitationDto })
  target?: AssistCitationDto;
}

export class AssistAnswerDto {
  @ApiProperty({ format: 'uuid', description: 'The ledger row of the answering call; feedback is given on it' })
  callId!: string;

  @ApiProperty({ type: [AssistBlockDto] })
  blocks!: AssistBlockDto[];

  @ApiProperty({ type: [AssistCitationDto], description: 'Only what a tool returned in this turn' })
  citations!: AssistCitationDto[];

  @ApiProperty({ type: [AssistSuggestionDto] })
  suggestions!: AssistSuggestionDto[];
}

export class AssistRefusedDto {
  @ApiProperty({ example: 409 })
  statusCode!: number;

  @ApiProperty({ example: 'The assistant is not available' })
  message!: string;

  @ApiProperty({ enum: REFUSALS, example: 'no_key' })
  reason!: AssistRefusal;
}

export class AssistFeedbackDto {
  @ApiProperty({ format: 'uuid', description: 'The `callId` of the answer being marked' })
  @IsUUID()
  callId!: string;

  @ApiProperty({ example: false })
  @IsBoolean()
  helpful!: boolean;

  @ApiPropertyOptional({
    example: 'Svaret handlet om et annet ord',
    maxLength: MAX_FEEDBACK_REASON_CHARS,
    description: 'Why, in the learner’s words. Kept in ai-service only; never sent on in events',
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_FEEDBACK_REASON_CHARS)
  reason?: string;
}
