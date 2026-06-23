import type { TaggableEntityType } from '../types/taggable-entity-type.js';

export interface IContentShareLookup {
  hasActiveShare(
    entityType: TaggableEntityType,
    entityId: string,
    userId: string,
  ): Promise<boolean>;
  /** Active share with EDIT permission specifically — grants the co-author role. */
  hasActiveEditShare(
    entityType: TaggableEntityType,
    entityId: string,
    userId: string,
  ): Promise<boolean>;
}

export const CONTENT_SHARE_LOOKUP = Symbol('IContentShareLookup');
