import { DifficultyLevel } from '../../modules/container/domain/value-objects/difficulty-level.vo.js';
import { ContainerType } from '../../modules/container/domain/value-objects/container-type.vo.js';
import { Visibility } from '../../modules/container/domain/value-objects/visibility.vo.js';

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

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
