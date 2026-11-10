import type { ContainerEntity } from '../entities/container.entity.js';
import type { ContainerType } from '../value-objects/container-type.vo.js';
import type { AccessTier } from '../value-objects/access-tier.vo.js';
import type { CatalogFilters } from '../../../../shared/discovery/domain/types/catalog-filters.js';
import type { SortParam } from '../../../../shared/discovery/domain/types/sort.js';

export const CONTAINER_CATALOG_READER = Symbol('CONTAINER_CATALOG_READER');

export interface ContainerCatalogCriteria {
  /** The caller; decides which containers are visible and whose own ones are never hidden. */
  userId: string;
  filters: CatalogFilters;
  containerType?: ContainerType;
  accessTier?: AccessTier;
  /**
   * When false, obsolete and archived courses are left out, except the caller's own
   * (their author is the only one who can bring them back). When true, nothing is hidden
   * by those two states: readers that resolve courses a learner already studies need it.
   */
  includeHidden: boolean;
  sort: SortParam[];
  skip: number;
  take: number;
}

/** Read side of the course list (catalogue, search, pickers). */
export interface IContainerCatalogReader {
  findPage(criteria: ContainerCatalogCriteria): Promise<{ items: ContainerEntity[]; total: number }>;
}
