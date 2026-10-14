import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AssetVariantResponseDto {
  @ApiProperty({ example: 'thumb_256' })
  variantType!: string;

  @ApiProperty({ example: 'image/webp' })
  mimeType!: string;

  @ApiProperty({ example: 45000 })
  sizeBytes!: number;

  @ApiProperty({ description: 'Direct or pre-signed URL (1 hour TTL for private assets)' })
  url!: string;
}

export class AssetSynthesisResponseDto {
  @ApiProperty({ example: 'piper' })
  provider!: string;

  @ApiProperty({ example: 'no_NO-talesyntese-medium', description: "The narrator's voice" })
  voice!: string;

  @ApiPropertyOptional({
    example: { Silje: 'nb-NO-PernilleNeural' },
    type: 'object',
    additionalProperties: { type: 'string' },
    description: 'Speaker → voice, when characters have voices of their own',
  })
  voices?: Record<string, string>;

  @ApiProperty({ example: 'nb' })
  lang!: string;

  @ApiProperty({
    example: '231f1f4fa95f13951d77500f23a5591c2d8e145cfd60a8cb2438f8ff06f9caa1',
    description: 'narrationTextHash of the spoken text; differs from the current body once the text is edited',
  })
  textHash!: string;

  @ApiProperty({ example: 21, description: 'Number of script segments spoken' })
  segments!: number;
}

export class AssetResponseDto {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  id!: string;

  @ApiProperty({ example: 'user-uuid' })
  ownerId!: string;

  @ApiProperty({ example: 'image/jpeg' })
  mimeType!: string;

  @ApiProperty({ example: 204800 })
  sizeBytes!: number;

  @ApiProperty({ example: 'user-uuid/abc123/photo.jpg' })
  storageKey!: string;

  @ApiPropertyOptional({ example: 'photo.jpg' })
  originalFilename!: string | null;

  @ApiProperty({ example: 'READY', enum: ['PENDING_UPLOAD', 'UPLOADED', 'PROCESSING', 'READY', 'FAILED', 'DELETED'] })
  status!: string;

  @ApiPropertyOptional({ example: 'profile_avatar' })
  entityType!: string | null;

  @ApiPropertyOptional({ example: 'profile-uuid' })
  entityId!: string | null;

  @ApiProperty({ description: 'Direct URL for public assets; pre-signed URL (1h TTL) for private assets' })
  url!: string;

  @ApiPropertyOptional({ example: '2024-01-01T00:00:00.000Z' })
  uploadedAt!: string | null;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ type: [AssetVariantResponseDto] })
  variants!: AssetVariantResponseDto[];

  @ApiPropertyOptional({
    example: 12400,
    nullable: true,
    type: Number,
    description: 'Audio only: measured length in milliseconds. Recordings have it from finalize on.',
  })
  durationMs!: number | null;

  @ApiPropertyOptional({
    example: [0.12, 0.48, 1, 0.73],
    nullable: true,
    type: [Number],
    description: 'Audio only: 100 maxima normalised to 0..1, computed after processing; null until then.',
  })
  peaks!: number[] | null;

  @ApiProperty({
    example: 'UPLOAD',
    enum: ['UPLOAD', 'SYNTHESIZED'],
    description: 'Where the bytes came from: a person’s upload or speech synthesis',
  })
  origin!: 'UPLOAD' | 'SYNTHESIZED';

  @ApiPropertyOptional({
    type: AssetSynthesisResponseDto,
    nullable: true,
    description: 'How a synthesized asset was made; null for an upload',
  })
  synthesis!: AssetSynthesisResponseDto | null;
}

export class PagedAssetsResponseDto {
  @ApiProperty({ type: [AssetResponseDto] })
  items!: AssetResponseDto[];

  @ApiProperty({ example: 42 })
  total!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 0 })
  offset!: number;
}
