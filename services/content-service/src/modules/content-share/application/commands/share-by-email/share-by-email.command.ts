import type { TaggableEntityType } from '../../../../../shared/access-control/domain/types/taggable-entity-type.js';
import type { SharePermission } from '../../../domain/value-objects/share-permission.vo.js';

/** Share a material with whoever owns an e-mail address (plan 90, session 16 remark 4, variant A). */
export class ShareByEmailCommand {
  constructor(
    public readonly callerUserId: string,
    public readonly isPlatformAdmin: boolean,
    public readonly entityType: TaggableEntityType,
    public readonly entityId: string,
    public readonly email: string,
    public readonly permission: SharePermission,
    public readonly expiresAt: Date | undefined,
    public readonly note: string | undefined,
  ) {}
}
