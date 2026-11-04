import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, Length, MaxLength, MinLength, ValidateIf } from 'class-validator';

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
}

export class SentenceCheckResponseDto {
  @ApiProperty({ enum: ['ok', 'refused', 'failed'] }) status!: string;
  @ApiPropertyOptional({ description: 'When ok: `AiFeedback` (`packages/contracts`), passage 0 is the sentence' })
  feedback?: unknown;
  @ApiPropertyOptional({ enum: ['language_not_supported', 'attempt_limit', 'pool_empty', 'not_available'], description: 'When refused' })
  reason?: string;
  @ApiPropertyOptional({ type: Number, nullable: true, description: 'On `attempt_limit`: ms until the learner may try this sentence again' })
  retryAfterMs?: number | null;
  @ApiPropertyOptional({ example: 'recording_inaudible', description: 'When failed' }) errorCode?: string;
  @ApiPropertyOptional({ type: [String], description: 'Ledger rows of the calls made' }) aiCallIds?: string[];
}
