import type { Visibility } from '../../../../modules/container/domain/value-objects/visibility.vo.js';
import type { AccessTier } from '../../../../modules/container/domain/value-objects/access-tier.vo.js';
import type { TaggableEntityType } from './taggable-entity-type.js';

export interface AccessibleEntity {
  id: string;
  entityType: TaggableEntityType;
  ownerUserId: string;
  ownerSchoolId: string | null;
  visibility: Visibility;
  deletedAt: Date | null;
  /** Present only for containers. */
  accessTier?: AccessTier;
}
