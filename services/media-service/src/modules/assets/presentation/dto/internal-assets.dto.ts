import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from 'class-validator';

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
}

export class AssetPlaybackDto {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  id!: string;

  @ApiProperty({ description: 'Pre-signed URL of the mp3 variant; of the original until processing is done' })
  url!: string;

  @ApiProperty({ example: 'audio/mpeg' })
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
