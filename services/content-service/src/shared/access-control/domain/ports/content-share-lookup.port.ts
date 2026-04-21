import type { TaggableEntityType } from '../types/taggable-entity-type.js';

export interface IContentShareLookup {
  hasActiveShare(
    entityType: TaggableEntityType,
    entityId: string,
    userId: string,
  ): Promise<boolean>;
}

export const CONTENT_SHARE_LOOKUP = Symbol('IContentShareLookup');
