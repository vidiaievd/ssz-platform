import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsUUID, Length, Matches, Min } from 'class-validator';

export class StartSoundSessionRequestDto {
  @ApiProperty({ example: 'nb', description: 'The language whose sounds are drilled' })
  @IsString()
  @Matches(/^[a-z]{2,3}$/i, { message: 'language must be a language code such as nb' })
  language!: string;

  @ApiPropertyOptional({
    example: 'nb:kj',
    description: 'A sound the learner chose (from its card). Absent — the session chooses: due cards, flagged sounds, else a diagnostic',
  })
  @IsOptional()
  @Matches(/^[a-z]{2,3}:[a-z_]+$/, { message: 'atomId must be a sound atom such as nb:kj' })
  atomId?: string;
}

class SessionSoundDto {
  @ApiProperty({ example: 'nb:kj' }) atomId!: string;
  @ApiProperty({ example: 'kj' }) family!: string;
  @ApiProperty({ enum: ['pending', 'open', 'passed', 'failed'] }) status!: string;
}

class SessionDiagnosticDto {
  @ApiProperty({ example: 3, description: 'Families measured or given up on so far' }) measured!: number;
  @ApiProperty({ example: 8 }) total!: number;
}

export class SoundSessionResponseDto {
  @ApiProperty() attemptId!: string;
  @ApiProperty({ description: 'The probe the session runs on (template `sound_session`)' }) probeId!: string;
  @ApiProperty({ description: 'An open session was handed back rather than a new one begun' }) resumed!: boolean;
  @ApiProperty({ example: 'nb' }) language!: string;
  @ApiProperty({ enum: ['chosen', 'record', 'diagnostic'], description: 'Why these sounds' }) basis!: string;
  @ApiProperty({ description: 'When the probe stops being answerable' }) expiresAt!: string;
  @ApiProperty({ enum: ['diagnostic', 'drill', 'done'] }) phase!: string;
  @ApiProperty({ enum: ['finished', 'take_limit', 'stopped', 'pool_empty', 'not_available'], nullable: true }) doneReason!: string | null;
  @ApiProperty({ example: 0, description: 'Takes of the drill so far (the diagnostic is not counted)' }) takes!: number;
  @ApiProperty({ example: 10 }) maxTakes!: number;
  @ApiProperty({ example: 0, description: 'Every take recorded so far, the diagnostic’s included; sent back with a take' }) takeIndex!: number;
  @ApiProperty({ type: [SessionSoundDto], description: 'Empty until the diagnostic is over' }) sounds!: SessionSoundDto[];
  @ApiProperty({ type: SessionDiagnosticDto, nullable: true }) diagnostic!: SessionDiagnosticDto | null;
  @ApiProperty({
    nullable: true,
    description:
      'What to say now: `{ phase: "diagnostic", atomId, family, index, total, word }` or ' +
      '`{ phase: "drill", atomId, family, elementIndex, element: word | pair | phrase, say, fails }`; null once done',
  })
  step!: unknown;
}

export class SoundTakeRequestDto {
  @ApiProperty({ description: 'The take — a `submission_recording` uploaded for this attempt (entityId = attemptId)' })
  @IsUUID()
  recordingAssetId!: string;

  @ApiProperty({ example: 0, description: '`takeIndex` of the session view the take was recorded for; another one → 409' })
  @IsInt()
  @Min(0)
  takeIndex!: number;

  @ApiPropertyOptional({ example: 'ru', description: 'The language a miss is explained in; English when absent' })
  @IsOptional()
  @IsString()
  @Length(2, 8)
  explanationLanguage?: string;
}

export class SoundSessionLocaleQueryDto {
  @ApiPropertyOptional({ example: 'ru', description: 'Interface locale of the instruction; `en` when absent' })
  @IsOptional()
  @IsString()
  @Length(2, 8)
  locale?: string;
}

export class SoundSessionItemsResponseDto {
  @ApiProperty({ type: SoundSessionResponseDto }) session!: SoundSessionResponseDto;
  @ApiProperty({
    description: 'Reference clips of the step: `[{ word, url, mimeType, expiresAt }]` — its word, both words of a pair; none for a course line',
  })
  clips!: unknown[];
  @ApiProperty({
    nullable: true,
    description:
      'The base of the sound in the asked locale: `{ atomId, locale, title, howTo, drill, commonError, ukNote }` ' +
      '(`commonError` for ru/uk readers only, `ukNote` for uk only); null in the diagnostic, once done, or when content is away',
  })
  instruction!: unknown;
}

export class SoundTakeResponseDto {
  @ApiProperty({
    enum: ['judged', 'stopped', 'retry'],
    description: '`judged` — the take counted; `stopped` — the payer may not go on, hand the session in; `retry` — nothing judged, record the same step again',
  })
  outcome!: string;
  @ApiProperty({ nullable: true, example: 'recording_not_ready', description: 'stopped: `pool_empty` / `not_available`; retry: why' })
  reason!: string | null;
  @ApiProperty({ nullable: true, description: '`{ measured, passed, key }`; null unless judged' }) verdict!: unknown;
  @ApiProperty({ nullable: true, description: 'Remarks of a sounds take (`AiFeedback`)' }) feedback!: unknown;
  @ApiProperty({ nullable: true, description: 'A toneme take: `{ tone, verdict, melody }`' }) toneme!: unknown;
  @ApiProperty({
    description:
      'What happened: `retry`, `side_passed`, `element_passed`, `sound_passed`, `sound_failed` (show the drill of the base), ' +
      '`diagnostic_measured`, `diagnostic_done`, `session_done`',
  })
  events!: unknown[];
  @ApiProperty({ type: SoundSessionResponseDto }) session!: SoundSessionResponseDto;
}

export class SubmitSoundSessionResponseDto {
  @ApiProperty() attemptId!: string;
  @ApiProperty({ nullable: true, example: 50, description: 'Share of the session’s sounds passed' }) score!: number | null;
  @ApiProperty({ enum: ['finished', 'take_limit', 'stopped', 'pool_empty', 'not_available'], nullable: true }) doneReason!: string | null;
  @ApiProperty({ description: '`[{ atomId, status, passes, fails, rating: GOOD | HARD | AGAIN | null }]`' }) sounds!: unknown[];
  @ApiProperty({ type: [String], description: 'Families the diagnostic heard as weak' }) diagnosticWeak!: string[];
  @ApiProperty({ type: SoundSessionResponseDto }) session!: SoundSessionResponseDto;
}
