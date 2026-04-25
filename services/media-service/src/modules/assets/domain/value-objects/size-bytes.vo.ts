import { Result } from '../../../../shared/kernel/result.js';
import { MediaAssetDomainError } from '../exceptions/media-asset.exceptions.js';
import type { MediaCategory } from './mime-type.vo.js';

export interface SizeLimits {
  maxImageSizeBytes: number;
  maxAudioSizeBytes: number;
  maxVideoSizeBytes: number;
}

export class SizeBytes {
  private constructor(private readonly _value: bigint) {}

  static create(
    value: number | bigint,
    category: MediaCategory,
    limits: SizeLimits,
  ): Result<SizeBytes, MediaAssetDomainError> {
    const bytes = typeof value === 'bigint' ? value : BigInt(value);

    if (bytes <= 0n) {
      return Result.fail(MediaAssetDomainError.FILE_TOO_LARGE);
    }

    const max = BigInt(
      category === 'image'
        ? limits.maxImageSizeBytes
        : category === 'audio'
          ? limits.maxAudioSizeBytes
          : limits.maxVideoSizeBytes,
    );

    if (bytes > max) {
      return Result.fail(MediaAssetDomainError.FILE_TOO_LARGE);
    }

    return Result.ok(new SizeBytes(bytes));
  }

  static reconstitute(value: bigint): SizeBytes {
    return new SizeBytes(value);
  }

  get value(): bigint {
    return this._value;
  }

  get asNumber(): number {
    return Number(this._value);
  }
}
