import type { AssetOrigin } from '../../../domain/entities/media-asset.entity.js';

export class RequestUploadCommand {
  constructor(
    public readonly ownerId: string,
    public readonly mimeType: string,
    public readonly sizeBytes: bigint,
    public readonly originalFilename: string | null,
    public readonly entityType: string | null,
    public readonly entityId: string | null,
    /** SYNTHESIZED when the service writes the bytes itself (`StoreSynthesizedAudioCommand`). */
    public readonly origin: AssetOrigin = 'UPLOAD',
  ) {}
}

export interface RequestUploadResult {
  assetId: string;
  uploadUrl: string;
  expiresAt: Date;
  storageKey: string;
}
