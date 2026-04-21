import type { TaggableEntityType } from '../../../../../shared/access-control/domain/types/taggable-entity-type.js';
import type { SharePermission } from '../../../domain/value-objects/share-permission.vo.js';

export class CreateContentShareCommand {
  constructor(
    public readonly callerUserId: string,
    public readonly isPlatformAdmin: boolean,
    public readonly entityType: TaggableEntityType,
    public readonly entityId: string,
    public readonly sharedWithUserId: string,
    public readonly permission: SharePermission,
    public readonly expiresAt: Date | undefined,
    public readonly note: string | undefined,
  ) {}
}
