import { IQuery } from '@nestjs/cqrs';
import { Result } from '../../../../../shared/kernel/result.js';

export interface AssetVariantView {
  variantType: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
}

export interface AssetView {
  id: string;
  ownerId: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  originalFilename: string | null;
  status: string;
  entityType: string | null;
  entityId: string | null;
  url: string;
  uploadedAt: string | null;
  createdAt: string;
  variants: AssetVariantView[];
}

export type GetAssetResult = Result<AssetView, 'ASSET_NOT_FOUND'>;

export class GetAssetQuery implements IQuery {
  constructor(
    readonly assetId: string,
    readonly requesterId: string,
  ) {}
}
