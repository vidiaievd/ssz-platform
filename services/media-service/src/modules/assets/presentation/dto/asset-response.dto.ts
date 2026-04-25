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
