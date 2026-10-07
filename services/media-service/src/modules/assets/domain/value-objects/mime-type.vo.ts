import { Result } from '../../../../shared/kernel/result.js';
import { MediaAssetDomainError } from '../exceptions/media-asset.exceptions.js';

export type MediaCategory = 'image' | 'audio' | 'video';

const ALLOWED_MIME_TYPES: Record<MediaCategory, string[]> = {
  image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
  audio: [
    'audio/mpeg',
    'audio/ogg',
    'audio/wav',
    'audio/opus',
    'audio/aac',
    'audio/flac',
    'audio/mp4',
    // What MediaRecorder produces in Chromium (plan 70); Firefox gives audio/ogg.
    'audio/webm',
  ],
  video: ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'],
};

const ALL_ALLOWED = new Set(Object.values(ALLOWED_MIME_TYPES).flat());

// Parameters are dropped: a recorder reports `audio/webm;codecs=opus`, and the codec
// is the container's business, not the asset's type.
function normalize(value: string): string {
  return (value.split(';')[0] ?? '').toLowerCase().trim();
}

export class MimeType {
  private constructor(private readonly _value: string) {}

  static create(value: string): Result<MimeType, MediaAssetDomainError> {
    const normalized = normalize(value);
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
    return ALL_ALLOWED.has(normalize(value));
  }
}
