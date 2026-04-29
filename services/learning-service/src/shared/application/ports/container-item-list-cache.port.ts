import type { ContentRef } from '../../domain/value-objects/content-ref.js';

export const CONTAINER_ITEM_LIST_CACHE = Symbol('IContainerItemListCache');

export interface IContainerItemListCache {
  get(containerId: string): Promise<ContentRef[] | null>;
  set(containerId: string, items: ContentRef[], ttlSeconds?: number): Promise<void>;
  invalidate(containerId: string): Promise<void>;
}
