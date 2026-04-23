import type { ContentEntitlementEntity } from '../entities/content-entitlement.entity.js';
import type { PaginatedResult } from '../../../../shared/kernel/pagination.js';

export interface EntitlementFilter {
  page: number;
  limit: number;
}

export interface IContentEntitlementRepository {
  findById(id: string): Promise<ContentEntitlementEntity | null>;
  findActiveByUser(
    userId: string,
    filter: EntitlementFilter,
  ): Promise<PaginatedResult<ContentEntitlementEntity>>;
  findActiveByContainer(
    containerId: string,
    filter: EntitlementFilter,
  ): Promise<PaginatedResult<ContentEntitlementEntity>>;
  hasActiveEntitlement(userId: string, containerId: string): Promise<boolean>;
  save(entity: ContentEntitlementEntity): Promise<ContentEntitlementEntity>;
}

export const CONTENT_ENTITLEMENT_REPOSITORY = Symbol('IContentEntitlementRepository');
