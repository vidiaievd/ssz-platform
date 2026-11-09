import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, Length, MaxLength, MinLength } from 'class-validator';

export class SentenceCheckRequestDto {
  @ApiProperty({ description: 'The prompt of the reading the sentence is from' })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  itemId!: string;

  @ApiProperty({ example: 'Jeg gleder meg til kveld.', description: 'The sentence as shown, markdown signs off; its words must be a run of the passage' })
  @IsString()
  @MinLength(1)
  @MaxLength(600)
  sentence!: string;

  @ApiProperty({ description: 'The learner’s take of the sentence — a media asset made for this attempt' })
  @IsUUID()
  recordingAssetId!: string;

  @ApiPropertyOptional({ example: 'ru', description: 'Interface language, for a learner whose school sets none' })
  @IsOptional()
  @IsString()
  @Length(2, 8)
  explanationLanguage?: string;
}

export class SentenceCheckResponseDto {
  @ApiProperty() attemptId!: string;
  @ApiProperty() itemId!: string;
  @ApiProperty({ enum: ['ok', 'refused', 'failed'] }) status!: string;
  @ApiPropertyOptional({ description: 'ok: `AiFeedback`, passage 0 is the sentence' }) feedback?: unknown;
  @ApiPropertyOptional({
    enum: ['language_not_supported', 'attempt_limit', 'pool_empty', 'not_available'],
    description: 'refused',
  })
  reason?: string;
  @ApiPropertyOptional({ type: Number, nullable: true, description: 'attempt_limit: ms until the learner may try this sentence again' })
  retryAfterMs?: number | null;
  @ApiPropertyOptional({ example: 'recording_inaudible', description: 'failed: the provider’s code, recording_*, or ai_unavailable' })
  errorCode?: string;
}
