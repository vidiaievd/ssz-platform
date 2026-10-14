import type { GetAssetResult } from '../get-asset/get-asset.query.js';

/**
 * The asset `assetId` replaced in a lesson body, while it can still be restored (plan 74, D5).
 * Read with the same rights as the asset itself: its owner, or anyone once it is READY
 * lesson media — so a co-author can restore a colleague's narration.
 */
export class GetPreviousAssetQuery {
  constructor(
    readonly assetId: string,
    readonly requesterId: string,
  ) {}
}

export type GetPreviousAssetResult = GetAssetResult;
