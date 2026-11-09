import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsString, Length, MaxLength } from 'class-validator';
import type { ReferenceClipOutcome } from '../domain/reference-clip.js';

export class ReferenceClipRequestDto {
  @ApiProperty({ example: 'nb', description: 'Course language; only `nb` has a carrier sentence and a lexicon' })
  @IsString()
  @Length(2, 8)
  language!: string;

  @ApiProperty({ example: 'bønner', description: 'One word as written' })
  @IsString()
  @MaxLength(64)
  word!: string;
}

export class ClipSpanDto {
  @ApiProperty({ example: 820 }) startMs!: number;
  @ApiProperty({ example: 1290 }) endMs!: number;
}

export class TonemeMeasureDto {
  @ApiProperty({ example: 3.4, description: "Stressed vowel's onset, semitones from the clip's median F0" })
  onset!: number;
  @ApiProperty({ example: 0.1, description: "Post-tonic vowel's level, semitones from the same median" }) post!: number;
  @ApiProperty({ example: 3.3, description: '`onset − post`; > 2.5 toneme 2, < 1.5 toneme 1, between — unsure' })
  score!: number;
  @ApiProperty({ type: Number, nullable: true, enum: [1, 2], description: 'Null between the bounds' }) tone!:
    1 | 2 | null;
}

export class ReferenceTryDto {
  @ApiProperty({ example: 'nb-NO-PernilleNeural' }) voice!: string;
  @ApiProperty({ enum: ['kept', 'not_heard', 'not_aligned', 'not_measured', 'tone_unsure', 'tone_mismatch'] })
  outcome!: string;
  @ApiProperty({ type: Number, nullable: true, example: 97, description: "Azure's 0–100 score of the word" })
  accuracy!: number | null;
  @ApiProperty({ type: TonemeMeasureDto, nullable: true }) measure!: TonemeMeasureDto | null;
}

export class ReferenceClipDto {
  @ApiProperty({ format: 'byte', description: 'WAV, PCM 16-bit, 16 kHz, mono, base64' }) wav!: string;
  @ApiProperty({ example: 2250 }) audioMs!: number;
  @ApiProperty({ example: 'nb-NO-PernilleNeural' }) voice!: string;
  @ApiProperty({ example: 'Nå sier jeg bønner igjen.' }) sentence!: string;
  @ApiProperty({ type: ClipSpanDto, description: 'The word in the clip' }) word!: ClipSpanDto;
  @ApiProperty({
    type: ClipSpanDto,
    nullable: true,
    description: 'Its stressed vowel; null when the word carries no toneme',
  })
  stressedVowel!: ClipSpanDto | null;
}

export class ReferenceClipResponseDto {
  @ApiProperty({ enum: ['ok', 'rejected', 'refused', 'failed'] }) status!: string;
  @ApiPropertyOptional({ type: ReferenceClipDto, description: 'When ok' }) clip?: ReferenceClipDto;
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    enum: [1, 2],
    description: "The lexicon's toneme of the word, when ok or rejected; null = it carries none",
  })
  tone?: 1 | 2 | null;
  @ApiPropertyOptional({
    enum: ['not_a_word', 'language_not_supported', 'not_in_lexicon', 'tone_ambiguous', 'not_available'],
    description: 'When refused',
  })
  reason?: string;
  @ApiPropertyOptional({ example: 'pitch_unavailable', description: 'When failed' }) errorCode?: string;
  @ApiPropertyOptional({ type: [ReferenceTryDto], description: 'Every voice tried, in order' })
  tries?: ReferenceTryDto[];
  @ApiPropertyOptional({ type: [String], description: 'Ledger rows of the calls made' }) aiCallIds?: string[];
}

/** The outcome as JSON: the clip's audio as base64. */
export function toResponse(outcome: ReferenceClipOutcome): ReferenceClipResponseDto {
  if (outcome.status !== 'ok') return outcome;
  const { audio, ...clip } = outcome.clip;
  return { ...outcome, clip: { ...clip, wav: Buffer.from(audio).toString('base64') } };
}

export class ReferenceWordsCheckRequestDto {
  @ApiProperty({ example: 'nb', description: 'Course language' })
  @IsString()
  @Length(2, 8)
  language!: string;

  @ApiProperty({ type: [String], example: ['kjenne', 'sola'], description: 'Words as written, up to 500' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  words!: string[];
}

export class ReferenceWordCheckDto {
  @ApiProperty({ example: 'sola', description: 'The word as the caller wrote it' }) word!: string;
  @ApiProperty({ enum: ['ok', 'refused'] }) status!: 'ok' | 'refused';
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    enum: [1, 2],
    description: "`ok`: the lexicon's toneme the clip would be checked against; null when the word carries none",
  })
  tone?: 1 | 2 | null;
  @ApiPropertyOptional({
    enum: ['not_a_word', 'language_not_supported', 'not_in_lexicon', 'tone_ambiguous'],
    description: '`refused`: why no clip can be made',
  })
  reason?: string;
}

export class ReferenceWordsCheckResponseDto {
  @ApiProperty({ type: [ReferenceWordCheckDto], description: 'One per word asked, in order' })
  words!: ReferenceWordCheckDto[];
}
