export class RequestUploadCommand {
  constructor(
    public readonly ownerId: string,
    public readonly mimeType: string,
    public readonly sizeBytes: bigint,
    public readonly originalFilename: string | null,
    public readonly entityType: string | null,
    public readonly entityId: string | null,
  ) {}
}

export interface RequestUploadResult {
  assetId: string;
  uploadUrl: string;
  expiresAt: Date;
  storageKey: string;
}
