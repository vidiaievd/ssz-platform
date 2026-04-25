import { Result } from '../../../../shared/kernel/result.js';
import { MediaAssetDomainError } from '../exceptions/media-asset.exceptions.js';

export type MediaCategory = 'image' | 'audio' | 'video';

const ALLOWED_MIME_TYPES: Record<MediaCategory, string[]> = {
  image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
  audio: ['audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/opus', 'audio/aac', 'audio/flac', 'audio/mp4'],
  video: ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'],
};

const ALL_ALLOWED = new Set(Object.values(ALLOWED_MIME_TYPES).flat());

export class MimeType {
  private constructor(private readonly _value: string) {}

  static create(value: string): Result<MimeType, MediaAssetDomainError> {
    const normalized = value.toLowerCase().trim();
    if (!ALL_ALLOWED.has(normalized)) {
      return Result.fail(MediaAssetDomainError.MIME_TYPE_NOT_ALLOWED);
    }
    return Result.ok(new MimeType(normalized));
  }

  static reconstitute(value: string): MimeType {
    return new MimeType(value);
  }

  get value(): string {
    return this._value;
  }

  get category(): MediaCategory {
    for (const [cat, types] of Object.entries(ALLOWED_MIME_TYPES) as [MediaCategory, string[]][]) {
      if (types.includes(this._value)) return cat;
    }
    return 'image';
  }

  get isImage(): boolean {
    return this.category === 'image';
  }

  get isAudio(): boolean {
    return this.category === 'audio';
  }

  get isVideo(): boolean {
    return this.category === 'video';
  }

  static isAllowed(value: string): boolean {
    return ALL_ALLOWED.has(value.toLowerCase().trim());
  }
}
