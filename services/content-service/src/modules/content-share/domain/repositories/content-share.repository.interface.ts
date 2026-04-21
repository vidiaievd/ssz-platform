import type { ContentShareEntity } from '../entities/content-share.entity.js';
import type { TaggableEntityType } from '../../../../shared/access-control/domain/types/taggable-entity-type.js';
import type { PaginatedResult } from '../../../../shared/kernel/pagination.js';

export interface ContentShareFilter {
  page: number;
  limit: number;
}

export interface IContentShareRepository {
  findById(id: string): Promise<ContentShareEntity | null>;
  findActiveByEntity(
    entityType: TaggableEntityType,
    entityId: string,
  ): Promise<ContentShareEntity[]>;
  findActiveBySharedWithUser(
    userId: string,
    filter: ContentShareFilter,
  ): Promise<PaginatedResult<ContentShareEntity>>;
  findExpiredAndNotRevoked(now: Date): Promise<ContentShareEntity[]>;
  hasActiveShare(
    entityType: TaggableEntityType,
    entityId: string,
    userId: string,
  ): Promise<boolean>;
  save(entity: ContentShareEntity): Promise<ContentShareEntity>;
  saveMany(entities: ContentShareEntity[]): Promise<void>;
}

export const CONTENT_SHARE_REPOSITORY = Symbol('IContentShareRepository');
