import type { MediaAssetDomainError } from '../../../domain/exceptions/media-asset.exceptions.js';
import type { Result } from '../../../../../shared/kernel/result.js';

/**
 * A lesson body stopped naming `assetId` and names `byAssetId` instead (plan 74, D5) — a new
 * narration, a recording that replaced a synthesized one, or the way back to an earlier one.
 */
export class SupersedeAssetCommand {
  constructor(
    public readonly assetId: string,
    public readonly byAssetId: string,
  ) {}
}

export interface SupersedeAssetView {
  assetId: string;
  supersededAt: string;
  supersededBy: string;
  /** The replaced asset can be restored until then; after it the sweep may remove it. */
  restorableUntil: string;
  /** True when the replacement had itself been superseded and is in use again. */
  restoredReplacement: boolean;
}

export type SupersedeAssetResult = Result<
  SupersedeAssetView,
  MediaAssetDomainError | 'ASSET_NOT_FOUND' | 'REPLACEMENT_NOT_FOUND'
>;
