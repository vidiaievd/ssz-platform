import type { TaggableEntityType } from '../../../../../shared/access-control/domain/types/taggable-entity-type.js';

export class ListSharesForEntityQuery {
  constructor(
    public readonly entityType: TaggableEntityType,
    public readonly entityId: string,
    public readonly callerUserId: string,
    public readonly isPlatformAdmin: boolean,
  ) {}
}
