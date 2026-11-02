import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsUUID, Length, MaxLength, ValidateIf } from 'class-validator';
import { TonemeMeasureDto } from '../../reference-synthesis/presentation/reference-clip.dto.js';

export class TonemeCheckRequestDto {
  @ApiProperty({
    type: String,
    nullable: true,
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    description: "The school whose `ai.practice` pays; null — the learner's own plan",
  })
  @ValidateIf((o: TonemeCheckRequestDto) => o.schoolId !== null)
  @IsUUID()
  schoolId!: string | null;

  @ApiProperty({ example: '7c9e6679-7425-40de-944b-e07fc1f90ae7' })
  @IsUUID()
  userId!: string;

  @ApiProperty({ example: 'nb', description: 'Course language; only `nb` has a carrier sentence and a lexicon' })
  @IsString()
  @Length(2, 8)
  language!: string;

  @ApiProperty({ example: 'bønner', description: 'One word as written; the learner said it in the carrier sentence' })
  @IsString()
  @MaxLength(64)
  word!: string;

  @ApiProperty({ description: "The learner's recording (media id); its `speech` variant is heard" })
  @IsUUID()
  recordingAssetId!: string;

  @ApiProperty({ description: "The word's reference clip (media `reference_clip`)" })
  @IsUUID()
  referenceAssetId!: string;
}

export class TonemeVerdictDto {
  @ApiProperty({ enum: ['like_reference', 'other_tone', 'unsure', 'not_measured'] }) kind!: string;
  @ApiPropertyOptional({ enum: [1, 2], description: 'On `other_tone`: the toneme the take sounded like' })
  heardAs?: 1 | 2;
}

export class TonemeComparisonDto {
  @ApiProperty({ enum: [1, 2], description: "The word's toneme by the lexicon" }) tone!: 1 | 2;
  @ApiProperty({
    type: TonemeMeasureDto,
    nullable: true,
    description: "The learner's measure; its `tone` by the learner's bounds (< 0.5 toneme 1, > 3.5 toneme 2)",
  })
  learner!: TonemeMeasureDto | null;
  @ApiProperty({ example: 3.3, description: "The reference's score, as its self-check measured it" })
  referenceScore!: number;
  @ApiProperty({ type: Number, nullable: true, example: -3.8, description: '`learner.score − referenceScore`' })
  gap!: number | null;
  @ApiProperty({ type: TonemeVerdictDto }) verdict!: TonemeVerdictDto;
}

export class TonemeMelodyDto {
  @ApiProperty({ example: 10 }) stepMs!: number;
  @ApiProperty({
    type: [Number],
    nullable: true,
    description: "From the stressed vowel to the word's end; semitones from the take's median F0, null unvoiced",
  })
  learner!: Array<number | null>;
  @ApiProperty({ type: [Number], nullable: true, description: 'The same stretch of the reference clip' })
  reference!: Array<number | null>;
}

export class SoundAtomRefDto {
  @ApiProperty({ example: 'sound' }) atomType!: 'sound';
  @ApiProperty({ example: 'nb:tone' }) atomId!: string;
}

export class TonemeCheckResponseDto {
  @ApiProperty({ enum: ['ok', 'unheard', 'refused', 'failed'] }) status!: string;
  @ApiPropertyOptional({ example: 'bønner' }) word?: string;
  @ApiPropertyOptional({ example: 'Nå sier jeg bønner igjen.' }) sentence?: string;
  @ApiPropertyOptional({ type: Number, nullable: true, example: 92, description: "Azure's 0–100 score of the word" })
  accuracy?: number | null;
  @ApiPropertyOptional({ type: TonemeComparisonDto, description: 'When ok' }) comparison?: TonemeComparisonDto;
  @ApiPropertyOptional({ type: TonemeMelodyDto, description: 'When ok' }) melody?: TonemeMelodyDto;
  @ApiPropertyOptional({
    type: SoundAtomRefDto,
    nullable: true,
    description: 'The toneme atom, on `other_tone` only; mark it after several such takes, not one',
  })
  atomRef?: SoundAtomRefDto | null;
  @ApiPropertyOptional({
    enum: [
      'word_not_heard',
      'sounds_not_aligned',
      'no_toneme_window',
      'not_a_word',
      'language_not_supported',
      'not_in_lexicon',
      'tone_ambiguous',
      'no_toneme',
      'not_a_reference',
      'not_available',
      'pool_empty',
    ],
    description: 'When unheard or refused',
  })
  reason?: string;
  @ApiPropertyOptional({ example: 'recording_inaudible', description: 'When failed' }) errorCode?: string;
  @ApiPropertyOptional({ type: [String], description: 'Ledger rows of the calls made' }) aiCallIds?: string[];
}
