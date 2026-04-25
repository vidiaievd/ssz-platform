import { randomUUID } from 'crypto';
import { Result } from '../../../../shared/kernel/result.js';
import { MediaAssetDomainError } from '../exceptions/media-asset.exceptions.js';

const VALID_KEY_PATTERN = /^[a-zA-Z0-9\-_/\.]+$/;

export class StorageKey {
  private constructor(private readonly _value: string) {}

  /**
   * Generate a new storage key: {ownerId}/{uuid}/{sanitized_filename}
   * The UUID prevents filename collisions between uploads for the same owner.
   */
  static generate(ownerId: string, originalFilename: string | null): StorageKey {
    const uuid = randomUUID();
    const sanitized = originalFilename
      ? StorageKey.sanitizeFilename(originalFilename)
      : 'file';
    return new StorageKey(`${ownerId}/${uuid}/${sanitized}`);
  }

  static create(value: string): Result<StorageKey, MediaAssetDomainError> {
    if (!value || !VALID_KEY_PATTERN.test(value)) {
      return Result.fail(MediaAssetDomainError.INVALID_STORAGE_KEY);
    }
    return Result.ok(new StorageKey(value));
  }

  static reconstitute(value: string): StorageKey {
    return new StorageKey(value);
  }

  /** Variant keys share the asset's path prefix: {ownerId}/{uuid}/variants/{variantType}.ext */
  variantKey(variantType: string, extension: string): StorageKey {
    const parts = this._value.split('/');
    // parts: [ownerId, uuid, filename] → take first two
    const prefix = parts.slice(0, 2).join('/');
    return new StorageKey(`${prefix}/variants/${variantType}.${extension}`);
  }

  get value(): string {
    return this._value;
  }

  private static sanitizeFilename(filename: string): string {
    return filename
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9\-_.]/g, '')
      .replace(/\.{2,}/g, '.')
      .slice(0, 128) || 'file';
  }
}
