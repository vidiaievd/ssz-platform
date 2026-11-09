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
  /**
   * What the entity is called, for a caller that asks about it from outside — the internal
   * visibility check hands it back so a new assignment can be named in the learner's
   * notification (VoxOrd plan 06, step 6b). Access decisions never read it.
   */
  title?: string | null;
}
