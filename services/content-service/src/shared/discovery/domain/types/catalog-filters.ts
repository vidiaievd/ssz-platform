import type { DifficultyLevel } from '../../../../modules/container/domain/value-objects/difficulty-level.vo.js';
import type { Visibility } from '../../../../modules/container/domain/value-objects/visibility.vo.js';

export interface CatalogFilters {
  targetLanguage?: string;
  difficultyLevel?: DifficultyLevel;
  /** Tag IDs to filter by (OR semantics: entity must have at least one). */
  tagIds?: string[];
  /** Case-insensitive substring match on title and description. */
  search?: string;
  ownerSchoolId?: string;
  ownerUserId?: string;
  /** User-specified visibility; ANDed on top of the server-side visibility scope. */
  visibility?: Visibility;
}
