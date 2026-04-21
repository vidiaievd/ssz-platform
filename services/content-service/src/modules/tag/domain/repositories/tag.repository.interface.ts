import { TagEntity } from '../entities/tag.entity.js';
import { TagScope } from '../value-objects/tag-scope.vo.js';
import { TagCategory } from '../value-objects/tag-category.vo.js';
import type { PaginatedResult } from '../../../../shared/kernel/pagination.js';

export const TAG_REPOSITORY = Symbol('ITagRepository');

export interface TagFilter {
  scope?: TagScope;
  category?: TagCategory;
  ownerSchoolId?: string | null;
  search?: string;
  page: number;
  limit: number;
}

export interface ITagRepository {
  findById(id: string): Promise<TagEntity | null>;
  findBySlugAndScope(
    slug: string,
    scope: TagScope,
    ownerSchoolId: string | null,
  ): Promise<TagEntity | null>;
  countBySlugPrefix(
    slugBase: string,
    scope: TagScope,
    ownerSchoolId: string | null,
  ): Promise<number>;
  findAll(filter: TagFilter): Promise<PaginatedResult<TagEntity>>;
  save(entity: TagEntity): Promise<TagEntity>;
}
