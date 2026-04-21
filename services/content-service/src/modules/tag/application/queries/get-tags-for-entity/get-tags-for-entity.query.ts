import type { TaggableEntityType } from '../../../../../shared/access-control/domain/types/taggable-entity-type.js';

export class GetTagsForEntityQuery {
  constructor(
    public readonly entityType: TaggableEntityType,
    public readonly entityId: string,
    public readonly userId: string,
    public readonly isPlatformAdmin: boolean,
  ) {}
}
