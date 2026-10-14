import type { AssetSynthesis } from '../../../domain/entities/media-asset.entity.js';
import type { MediaAssetDomainError } from '../../../domain/exceptions/media-asset.exceptions.js';
import type { Result } from '../../../../../shared/kernel/result.js';

/**
 * Put synthesized audio into a SYNTHESIZED asset that is still PENDING_UPLOAD, record how it
 * was made, and finalize it like an upload (plan 74). Processing then measures the duration,
 * draws the waveform and turns the asset READY exactly as for a recording a person uploaded.
 */
export class StoreSynthesizedAudioCommand {
  constructor(
    public readonly assetId: string,
    public readonly ownerId: string,
    public readonly audio: Buffer,
    public readonly mimeType: string,
    public readonly synthesis: AssetSynthesis,
  ) {}
}

export type StoreSynthesizedAudioResult = Result<
  void,
  MediaAssetDomainError | 'ASSET_NOT_FOUND' | 'FILE_NOT_FOUND_IN_STORAGE'
>;
