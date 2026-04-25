import { MediaAssetDomainError } from '../../../domain/exceptions/media-asset.exceptions.js';
import { Result } from '../../../../../shared/kernel/result.js';

export class FinalizeUploadCommand {
  constructor(
    public readonly assetId: string,
    public readonly ownerId: string,
  ) {}
}

export type FinalizeUploadResult = Result<void, MediaAssetDomainError | 'ASSET_NOT_FOUND' | 'FILE_NOT_FOUND_IN_STORAGE'>;
