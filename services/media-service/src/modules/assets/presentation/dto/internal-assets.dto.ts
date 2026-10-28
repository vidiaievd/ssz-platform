import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsOptional, IsUUID } from 'class-validator';
import type { PlaybackVariant } from '../../application/queries/get-playback/get-playback.query.js';

// A submission has at most six prompts; with kept discarded takes a few dozen ids at most.
const MAX_IDS = 100;

export class AssetIdsDto {
  @ApiProperty({
    type: [String],
    example: ['3fa85f64-5717-4562-b3fc-2c963f66afa6'],
    description: `Asset ids, 1–${MAX_IDS}. Unknown ids are left out of the answer.`,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_IDS)
  @IsUUID(undefined, { each: true })
  ids!: string[];
}

const PLAYBACK_VARIANTS: PlaybackVariant[] = ['playback', 'speech'];

export class PlaybackRequestDto extends AssetIdsDto {
  @ApiPropertyOptional({
    enum: PLAYBACK_VARIANTS,
    default: 'playback',
    description:
      '`playback` — what a reviewer listens to (mp3, the original until processed). `speech` — WAV ' +
      '16-bit PCM 16 kHz mono for speech recognition (plan 82); only recordings that have it are returned.',
  })
  @IsOptional()
  @IsIn(PLAYBACK_VARIANTS)
  variant?: PlaybackVariant;
}

export class AssetDescriptionDto {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  id!: string;

  @ApiProperty({ example: 'student-uuid', description: 'Who uploaded the asset' })
  ownerId!: string;

  @ApiPropertyOptional({ example: 'submission_recording', nullable: true, type: String })
  entityType!: string | null;

  @ApiPropertyOptional({
    example: 'attempt-uuid',
    nullable: true,
    type: String,
    description: 'For a recording: the attempt it was made for',
  })
  entityId!: string | null;

  @ApiProperty({ example: 'READY', enum: ['PENDING_UPLOAD', 'UPLOADED', 'PROCESSING', 'READY', 'FAILED', 'DELETED'] })
  status!: string;

  @ApiProperty({ example: 'audio/webm' })
  mimeType!: string;

  @ApiProperty({ example: 148000 })
  sizeBytes!: number;

  @ApiPropertyOptional({ example: 24300, nullable: true, type: Number, description: 'Measured length, ms' })
  durationMs!: number | null;

  @ApiProperty({ example: 'SYNTHESIZED', enum: ['UPLOAD', 'SYNTHESIZED'] })
  origin!: string;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'For a synthesized asset: narrationTextHash of the text it spoke',
  })
  textHash!: string | null;

  @ApiPropertyOptional({ nullable: true, type: Number, description: 'Pace a synthesized narration was spoken with' })
  lengthScale!: number | null;

  @ApiPropertyOptional({ nullable: true, type: Number, description: 'Pause multiplier it was spoken with' })
  pauseScale!: number | null;

  @ApiPropertyOptional({ nullable: true, type: String, description: 'Catalog id of the narrator of a synthesized narration' })
  voiceId!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    example: { Erik: 'nvcc-mmn', Taras: 'nvcc-kon' },
    description: 'Speaker → catalog voice id of a synthesized narration\'s dialogue',
  })
  speakerVoices!: Record<string, string> | null;
}

export class AssetPlaybackDto {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  id!: string;

  @ApiProperty({
    description: 'Pre-signed URL of the mp3 variant (the original until processing is done), or of the speech WAV',
  })
  url!: string;

  @ApiProperty({ example: 'audio/mpeg', description: '`audio/wav` for the speech variant' })
  mimeType!: string;

  @ApiProperty({ example: '2026-10-05T18:00:00.000Z' })
  expiresAt!: string;

  @ApiPropertyOptional({ example: 24300, nullable: true, type: Number })
  durationMs!: number | null;

  @ApiPropertyOptional({
    example: [0.12, 0.48, 1, 0.73],
    nullable: true,
    type: [Number],
    description: '100 maxima normalised to 0..1; null until processing has drawn them',
  })
  peaks!: number[] | null;
}
