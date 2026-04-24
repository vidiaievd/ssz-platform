import { DifficultyLevel } from '../../modules/container/domain/value-objects/difficulty-level.vo.js';
import { ContainerType } from '../../modules/container/domain/value-objects/container-type.vo.js';
import { Visibility } from '../../modules/container/domain/value-objects/visibility.vo.js';

// Re-exported from canonical location; import from shared/discovery for new code.
export type { PaginatedResult } from '../discovery/domain/types/pagination.js';

export interface ContainerFilter {
  targetLanguage?: string;
  difficultyLevel?: DifficultyLevel;
  containerType?: ContainerType;
  visibility?: Visibility;
  ownerUserId?: string;
  ownerSchoolId?: string;
  search?: string;
  page: number;
  limit: number;
  sort?: string;
  includeDeleted?: boolean;
}
