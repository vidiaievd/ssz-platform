export const STORAGE_SERVICE = Symbol('STORAGE_SERVICE');

export interface PresignedUploadResult {
  uploadUrl: string;
  expiresAt: Date;
}

export interface ObjectMetadata {
  sizeBytes: bigint;
  mimeType: string;
  lastModified: Date;
}

export interface IStorageService {
  /**
   * Generate a pre-signed PUT URL. Client uploads directly to MinIO/S3.
   * @param isPublic - true for public bucket (avatars), false for private
   */
  generatePresignedUploadUrl(
    key: string,
    mimeType: string,
    isPublic: boolean,
    ttlSeconds: number,
  ): Promise<PresignedUploadResult>;

  /**
   * Generate a pre-signed GET URL for private bucket assets.
   * For public bucket assets, use getPublicUrl() instead.
   */
  generatePresignedDownloadUrl(key: string, ttlSeconds: number): Promise<string>;

  /** Direct public URL — only valid for assets in the public bucket. */
  getPublicUrl(key: string): string;

  /** Returns true if the object exists in the given bucket. */
  objectExists(key: string, isPublic: boolean): Promise<boolean>;

  /** Returns object metadata, or null if it does not exist. */
  getObjectMetadata(key: string, isPublic: boolean): Promise<ObjectMetadata | null>;

  deleteObject(key: string, isPublic: boolean): Promise<void>;
}

// Determines which bucket an asset belongs to based on entityType.
// profile_avatar → public (direct URL access), everything else → private.
export function isPublicEntityType(entityType: string | null): boolean {
  return entityType === 'profile_avatar';
}
