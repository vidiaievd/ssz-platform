import { ApiProperty } from '@nestjs/swagger';

export class RequestUploadResponseDto {
  @ApiProperty({ description: 'ID of the created MediaAsset record' })
  assetId!: string;

  @ApiProperty({ description: 'Pre-signed PUT URL — upload the file directly to this URL' })
  uploadUrl!: string;

  @ApiProperty({ description: 'When the upload URL expires (ISO 8601)' })
  expiresAt!: string;

  @ApiProperty({ description: 'After uploading, call POST /uploads/:assetId/finalize' })
  finalizeUrl!: string;
}
