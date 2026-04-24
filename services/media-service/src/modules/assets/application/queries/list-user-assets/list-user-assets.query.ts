import { IQuery } from '@nestjs/cqrs';
import { Result } from '../../../../../shared/kernel/result.js';
import type { AssetView } from '../get-asset/get-asset.query.js';

export interface ListUserAssetsOptions {
  entityType?: string;
  entityId?: string;
  limit: number;
  offset: number;
}

export interface PagedAssetsView {
  items: AssetView[];
  total: number;
  limit: number;
  offset: number;
}

export type ListUserAssetsResult = Result<PagedAssetsView, never>;

export class ListUserAssetsQuery implements IQuery {
  constructor(
    readonly ownerId: string,
    readonly options: ListUserAssetsOptions,
  ) {}
}
