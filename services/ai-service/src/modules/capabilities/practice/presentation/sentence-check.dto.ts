import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

/** The sound a session's take is judged on (plan 86, step 13.3). */
export class SentenceCheckTargetDto {
  @ApiProperty({ example: 'nb:kj', description: 'A `sound` atom of the language, scored in the context (not `nb:tone` — that is `toneme-checks`)' })
  @IsString()
  @Length(3, 40)
  atomId!: string;

  @ApiProperty({ type: [String], example: ['kjenne'], description: 'Words of the sentence carrying the sound; only they decide the verdict' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  words!: string[];

  @ApiProperty({
    enum: ['word', 'fluent'],
    description: '`word` — a word in its carrier frame (single-word thresholds); `fluent` — a line of running speech',
  })
  @IsIn(['word', 'fluent'])
  context!: 'word' | 'fluent';

  @ApiPropertyOptional({
    type: [String],
    example: ['KJ:major'],
    description: '`target.weakest.key`s the model already explained on this element; that miss is not explained again',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  explained?: string[];
}

export class SentenceCheckRequestDto {
  @ApiProperty({
    type: String,
    nullable: true,
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    description: "The school whose `ai.practice` pays; null — the learner's own plan",
  })
  @ValidateIf((o: SentenceCheckRequestDto) => o.schoolId !== null)
  @IsUUID()
  schoolId!: string | null;

  @ApiProperty({ example: '7c9e6679-7425-40de-944b-e07fc1f90ae7' })
  @IsUUID()
  userId!: string;

  @ApiPropertyOptional({ description: "The reading's exercise, for the ledger only; tries are not counted against it" })
  @IsOptional()
  @IsUUID()
  exerciseId?: string;

  @ApiProperty({ example: 'nb', description: 'Course language; only a language with a sound inventory (`nb`) is heard' })
  @IsString()
  @Length(2, 8)
  language!: string;

  @ApiPropertyOptional({ example: 'ru', description: 'The language the sounds are explained in; English when absent' })
  @IsOptional()
  @IsString()
  @Length(2, 8)
  explanationLanguage?: string;

  @ApiProperty({ example: 'Jeg gleder meg til kveld.', description: 'The sentence as written, markdown signs off' })
  @IsString()
  @MinLength(1)
  @MaxLength(600)
  sentence!: string;

  @ApiProperty({ description: "The learner's recording (media id); its `speech` variant is heard" })
  @IsUUID()
  recordingAssetId!: string;

  @ApiPropertyOptional({
    type: SentenceCheckTargetDto,
    description: "A pronunciation session's take: the sound to judge it on. Absent — a drill take, remarks only",
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => SentenceCheckTargetDto)
  target?: SentenceCheckTargetDto;
}

export class TargetSoundDto {
  @ApiProperty({ example: 'kjenne' }) word!: string;
  @ApiProperty({ type: [String], example: ['KJ'], description: 'NoFAbet; two when the readings differ in the symbol' })
  symbols!: string[];
  @ApiProperty({ type: String, nullable: true, example: 'ç' }) ipa!: string | null;
  @ApiProperty({ example: 12, description: "Azure's 0–100 score of the sound" }) accuracy!: number;
  @ApiProperty({ example: 53, description: "Natives' 10th percentile in the context; at or above it passes" }) threshold!: number;
  @ApiProperty({ enum: ['minor', 'major'], nullable: true, description: 'Null when it passed' }) severity!: string | null;
  @ApiProperty({ type: String, nullable: true, example: 'KJ:major', description: 'The kind of miss, for `target.explained` of the next take; null when passed' })
  key!: string | null;
}

export class SentenceCheckTargetVerdictDto {
  @ApiProperty({ example: 'nb:kj' }) atomId!: string;
  @ApiProperty({ description: 'False — the take does not count for or against the sound (word left out, sounds not named, no scores)' })
  measured!: boolean;
  @ApiPropertyOptional({
    enum: ['no_sounds', 'word_not_heard', 'not_aligned', 'family_not_heard'],
    description: 'When not measured',
  })
  reason?: string;
  @ApiProperty({ description: 'Every scored sound of the family in the target words at or above its threshold' }) passed!: boolean;
  @ApiProperty({ type: TargetSoundDto, nullable: true, description: 'The sound furthest under (or least over) its threshold; null when not measured' })
  weakest!: TargetSoundDto | null;
  @ApiProperty({ description: "Whether this take's feedback carries the model's explanation of the target's miss" }) explained!: boolean;
}

export class SentenceCheckResponseDto {
  @ApiProperty({ enum: ['ok', 'refused', 'failed'] }) status!: string;
  @ApiPropertyOptional({ description: 'When ok: `AiFeedback` (`packages/contracts`), passage 0 is the sentence' })
  feedback?: unknown;
  @ApiPropertyOptional({ type: SentenceCheckTargetVerdictDto, description: 'When ok and a target was asked for (plan 86, step 13.3)' })
  target?: SentenceCheckTargetVerdictDto;
  @ApiPropertyOptional({
    enum: ['language_not_supported', 'attempt_limit', 'pool_empty', 'not_available', 'target_not_scored', 'target_not_in_sentence'],
    description: 'When refused',
  })
  reason?: string;
  @ApiPropertyOptional({ type: Number, nullable: true, description: 'On `attempt_limit`: ms until the learner may try this sentence again' })
  retryAfterMs?: number | null;
  @ApiPropertyOptional({ example: 'recording_inaudible', description: 'When failed' }) errorCode?: string;
  @ApiPropertyOptional({ type: [String], description: 'Ledger rows of the calls made' }) aiCallIds?: string[];
}
